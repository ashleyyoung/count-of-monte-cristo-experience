#!/usr/bin/env npx tsx
/**
 * scripts/translate/backfill-sections.ts
 *
 * Two-phase backfill of reading-order sections (column regions + correct
 * ordering) onto already-ingested days.
 *
 * Phase 1 — re-ingest ALTO only (cheap, no LLM):  --fetch-only
 *   Re-fetches the ALTO XML (the only Gallica call — scans/images untouched),
 *   caches the raw XML to R2 (so this is the last fetch ever), and writes the
 *   corrected stitch + section sidecar. No translation, no tokens. Real ALTO
 *   calls are spaced out (16s default) to respect Gallica's rate limit; cache
 *   hits impose no delay, so re-runs are fast and Gallica-free.
 *
 * Phase 2 — translate section-aware (costs tokens):  (default, no flag)
 *   Re-translates each target day column-by-column so the English aligns to
 *   the cached section regions. Uses the cached stitch/sidecar from phase 1, so
 *   it makes no Gallica calls.
 *
 * Recommended flow: run phase 1 once for everything, evaluate translations a
 * day at a time with `translate-day.ts --date=… --force` (Gallica-free, uses
 * the cached sidecar), then run phase 2 to translate the rest in bulk.
 *
 * Idempotent / resumable: phase 1 skips days that already have a sidecar;
 * phase 2 targets only days whose translated pages still lack `sections`.
 *
 * Usage:
 *   npx tsx scripts/translate/backfill-sections.ts --fetch-only            # phase 1, all days
 *   npx tsx scripts/translate/backfill-sections.ts --fetch-only --dry-run
 *   npx tsx scripts/translate/backfill-sections.ts --dates=1844-08-28 --fetch-only
 *   npx tsx scripts/translate/backfill-sections.ts                         # phase 2, translate
 *   npx tsx scripts/translate/backfill-sections.ts --limit=5 --model=claude-sonnet-4-6
 */

import "dotenv/config";
import { makeClient, runDayTranslation } from "../../lib/translate/pipeline";
import { buildTranslationRunOptions } from "../../lib/translate/run-options";
import {
  fetchAltoToR2,
  altoSectionsR2Key,
  effectivePageCount,
} from "../../lib/translate/french-source";
import {
  resolveIssueArk,
  gallicaPermalink,
  parseArkFromGallicaUrl,
  DEBATS_PERIODICAL_ARK,
} from "../../lib/gallica";
import { r2ObjectExists } from "../../lib/r2-server";
import { isMissingGallicaIssue } from "../../lib/missing-issues";
import { parseDayDoc, type DayDoc } from "../../lib/types/content";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

interface DayRow {
  installment_date: string;
  doc: {
    translated_pages?: Array<{ kind?: string; sections?: unknown[] }>;
    gallica_issue_url?: string | null;
  };
}

/** Phase 2 target: at least one translated page, but no section data yet. */
function needsTranslateBackfill(row: DayRow): boolean {
  const pages = row.doc?.translated_pages ?? [];
  if (pages.length === 0) return false;
  return pages.some(
    (p) => p?.kind === "text" && (p.sections?.length ?? 0) === 0,
  );
}

/** Resolve the issue ARK + page count for a day (cached URL first, then API). */
async function resolveIssue(
  date: string,
  doc: DayDoc,
): Promise<{ ark: string; pageCount: number } | null> {
  const fromUrl = doc.gallica_issue_url
    ? parseArkFromGallicaUrl(doc.gallica_issue_url)
    : null;
  if (fromUrl) return { ark: fromUrl, pageCount: effectivePageCount(doc) };
  const resolved = await resolveIssueArk(DEBATS_PERIODICAL_ARK, date);
  if (!resolved) return null;
  return { ark: resolved.ark, pageCount: effectivePageCount(doc, resolved.pageCount) };
}

async function main() {
  if (hasFlag("help")) {
    console.log(
      "Usage: backfill-sections.ts [--fetch-only] [--dry-run] [--limit=N] [--dates=d1,d2] [--delay=ms] [--model=id]",
    );
    return;
  }

  const fetchOnly = hasFlag("fetch-only");
  const dryRun = hasFlag("dry-run");
  const limit = arg("limit") ? parseInt(arg("limit")!, 10) : Infinity;
  const model = arg("model");
  const delayMs = arg("delay") ? parseInt(arg("delay")!, 10) : undefined;
  const explicitDates = arg("dates")
    ?.split(",")
    .map((d) => d.trim())
    .filter(Boolean);

  // Apply rate-limit spacing to every real ALTO fetch in this process (the
  // library already defaults to 16s; --delay overrides).
  if (delayMs != null) process.env.ALTO_PAGE_DELAY_MS = String(delayMs);

  const supabase = makeClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("day_content")
    .select("installment_date, doc")
    .order("installment_date", { ascending: true });
  if (error) throw new Error(`day_content read failed: ${error.message}`);
  const rows = data as DayRow[];
  const byDate = new Map(rows.map((r) => [r.installment_date, r]));

  // Resolve target dates.
  let targets: string[];
  if (explicitDates?.length) {
    targets = explicitDates;
  } else if (fetchOnly) {
    // Phase 1: every ingested day that has a Gallica issue.
    targets = rows
      .map((r) => r.installment_date)
      .filter((d) => !isMissingGallicaIssue(d));
  } else {
    // Phase 2: days whose translated pages still lack sections.
    targets = rows.filter(needsTranslateBackfill).map((r) => r.installment_date);
  }
  targets = targets.slice(0, limit);

  console.error(
    `[backfill] mode=${fetchOnly ? "fetch-only (no translation)" : "translate"} · ` +
      `${targets.length} day(s)` +
      (dryRun ? " — DRY RUN" : ""),
  );
  for (const d of targets) console.error(`  - ${d}`);
  if (dryRun || targets.length === 0) return;

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let cost = 0;

  const runOptions = buildTranslationRunOptions({
    model,
    forceFetch: true, // uses cached XML if present, so no Gallica hit after phase 1
    force: true, // re-translate every page section-aware
  });

  for (let i = 0; i < targets.length; i++) {
    const date = targets[i];
    const log = (msg: string) => console.error(`[backfill] ${date}: ${msg}`);
    try {
      if (fetchOnly) {
        // Resumable: skip days that already have a section sidecar.
        if (await r2ObjectExists(altoSectionsR2Key(date))) {
          console.error(
            `[backfill] (${i + 1}/${targets.length}) ${date} — sidecar exists, skip.`,
          );
          skipped++;
          continue;
        }
        const row = byDate.get(date);
        const doc = parseDayDoc(row?.doc ?? {});
        const issue = await resolveIssue(date, doc);
        if (!issue) {
          console.error(
            `[backfill] (${i + 1}/${targets.length}) ${date} — no Gallica issue, skip.`,
          );
          skipped++;
          continue;
        }
        console.error(
          `[backfill] (${i + 1}/${targets.length}) ${date} — fetching ALTO (${issue.pageCount}p)…`,
        );
        await fetchAltoToR2({
          date,
          ark: issue.ark,
          pageCount: issue.pageCount,
          log,
        });
        ok++;
      } else {
        console.error(`\n[backfill] (${i + 1}/${targets.length}) ${date} — translating…`);
        const summary = await runDayTranslation(date, log, runOptions);
        cost += summary.cost_usd_total;
        if (summary.failed.length > 0) {
          failed++;
          console.error(`[backfill] ${date}: ${summary.failed.length} failure(s).`);
        } else {
          ok++;
          console.error(
            `[backfill] ${date}: done (cost=$${summary.cost_usd_total.toFixed(4)}).`,
          );
        }
      }
    } catch (err) {
      failed++;
      console.error(
        `[backfill] ${date}: ERROR — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  console.error(
    `\n[backfill] Done. ok=${ok} skipped=${skipped} failed=${failed}` +
      (fetchOnly ? "" : ` total_cost=$${cost.toFixed(4)}`),
  );
  console.log(JSON.stringify({ mode: fetchOnly ? "fetch-only" : "translate", ok, skipped, failed, cost_usd: cost }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
