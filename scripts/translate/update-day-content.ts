#!/usr/bin/env npx tsx
/**
 * scripts/translate/update-day-content.ts
 *
 * Select the live TextItem per section and upsert it into day_content.doc.
 *
 * Waterfall precedence (which version is LIVE):
 *   1. existing_published / public-domain (human/Gutenberg) — preferred public text
 *   2. machine_claude — our Claude translation (if no external source)
 *
 * Single-writer rule: this script only SELECTS + SNAPSHOTS. It does NOT author
 * new translation_versions rows (that is translate-day.ts / pipeline.ts's job).
 *
 * Usage:
 *   npx tsx scripts/translate/update-day-content.ts --date=1844-08-28 [--dry-run]
 */

import "dotenv/config";
import {
  parseCliDate,
  DRY_RUN,
  makeSupabaseClient,
  loadDayDoc,
  saveDayDoc,
  logStructuredError,
} from "../gallica/_shared";
import {
  parseDayDoc,
  type DayDoc,
  type TextItem,
} from "../../lib/types/content";
import { ALL_SECTIONS, type SectionKey } from "../../lib/translate/pipeline";

type SupabaseClient = ReturnType<typeof makeSupabaseClient>;

interface VersionRow {
  id: string;
  slot_key: string;
  text_r2_key: string;
  source: string;
  original_date: string | null;
  gallica_url: string;
  license: string;
  attribution: string;
  contributor_id: string | null;
  translation_origin: string;
  model_used: string | null;
  translator: string | null;
  translation_source_url: string | null;
  source_text_url: string | null;
  fr_intermediate_r2_key: string | null;
  cost_usd: number | null;
  low_confidence: boolean;
  admin_notes: string | null;
}

async function fetchLatestVersions(
  supabase: SupabaseClient,
  date: string,
  section: SectionKey,
): Promise<VersionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("translation_versions")
    .select("*")
    .eq("installment_date", date)
    .eq("section", section)
    .order("translated_at", { ascending: false });

  if (error) {
    throw new Error(
      `translation_versions fetch failed for ${date}/${section}: ${error.message}`,
    );
  }
  return (data ?? []) as VersionRow[];
}

/** Select the live version row: prefer existing_published > machine_claude. */
function selectLive(rows: VersionRow[]): VersionRow | null {
  if (!rows.length) return null;
  const published = rows.find(
    (r) => r.translation_origin === "existing_published",
  );
  if (published) return published;
  const machine = rows.find((r) => r.translation_origin === "machine_claude");
  return machine ?? rows[0];
}

function rowToTextItem(row: VersionRow, installmentDate: string): TextItem {
  const year = installmentDate.slice(0, 4);
  return {
    kind: "text",
    text_r2_key: row.text_r2_key,
    source: row.source,
    // TextItemSchema requires a valid ISO date and URL; fall back to the
    // installment date / periodical permalink when a legacy row omits them so
    // selecting a live item never fails Zod validation.
    original_date: row.original_date ?? installmentDate,
    gallica_url:
      row.gallica_url ??
      `https://gallica.bnf.fr/ark:/12148/cb39294634r/date${year}`,
    license: row.license,
    attribution: row.attribution,
    contributor_id: row.contributor_id ?? undefined,
    slot_key: row.slot_key,
    translation_origin:
      row.translation_origin as TextItem["translation_origin"],
    translation_model: row.model_used ?? undefined,
    translator: row.translator ?? undefined,
    translation_source_url: row.translation_source_url ?? undefined,
    source_text_url: row.source_text_url ?? undefined,
    fr_intermediate_r2_key: row.fr_intermediate_r2_key ?? undefined,
    low_confidence: row.low_confidence || undefined,
    admin_notes: row.admin_notes ?? undefined,
    translation_version_id: row.id,
  };
}

function setSectionItem(
  doc: DayDoc,
  section: SectionKey,
  item: TextItem,
): DayDoc {
  const updated = { ...doc };
  switch (section) {
    case "overview":
      updated.overview = [
        ...(doc.overview ?? []).filter((i) => i.kind !== "text"),
        item,
      ];
      break;
    case "news":
      updated.news = [
        ...(doc.news ?? []).filter((i) => i.kind !== "text"),
        item,
      ];
      break;
    case "chapter":
      updated.chapter = [
        ...(doc.chapter ?? []).filter((i) => i.kind !== "text"),
        item,
      ];
      break;
    case "debats.music":
      updated.debats = {
        ...(doc.debats ?? { music: [], theater: [], art: [], literature: [] }),
        music: [
          ...(doc.debats?.music ?? []).filter((i) => i.kind !== "text"),
          item,
        ],
      };
      break;
    case "debats.theater":
      updated.debats = {
        ...(doc.debats ?? { music: [], theater: [], art: [], literature: [] }),
        theater: [
          ...(doc.debats?.theater ?? []).filter((i) => i.kind !== "text"),
          item,
        ],
      };
      break;
    case "debats.art":
      updated.debats = {
        ...(doc.debats ?? { music: [], theater: [], art: [], literature: [] }),
        art: [
          ...(doc.debats?.art ?? []).filter((i) => i.kind !== "text"),
          item,
        ],
      };
      break;
    case "debats.literature":
      updated.debats = {
        ...(doc.debats ?? { music: [], theater: [], art: [], literature: [] }),
        literature: [
          ...(doc.debats?.literature ?? []).filter((i) => i.kind !== "text"),
          item,
        ],
      };
      break;
    case "art_exhibitions":
      updated.art_exhibitions = [
        ...(doc.art_exhibitions ?? []).filter((i) => i.kind !== "text"),
        item,
      ];
      break;
    case "science":
      updated.science = [
        ...(doc.science ?? []).filter((i) => i.kind !== "text"),
        item,
      ];
      break;
    case "galignani":
      updated.galignani = [
        ...(doc.galignani ?? []).filter((i) => i.kind !== "text"),
        item,
      ];
      break;
  }
  return updated;
}

const HELP = `update-day-content — snapshot the live text into day_content

Reads:  translation_versions for the date (existing_published > machine_claude)
Writes: day_content.doc so the day page shows the current text
Next:   open http://localhost:3001/day/YYYY-MM-DD

Usage:
  npx tsx scripts/translate/update-day-content.ts --date=YYYY-MM-DD`;

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const date = parseCliDate();
  console.error(
    `[update-day-content] Processing ${date}${DRY_RUN ? " (dry-run)" : ""}…`,
  );

  const supabase = makeSupabaseClient();
  let doc = await loadDayDoc(supabase, date);

  const results: Array<{
    section: string;
    action: "set" | "no-versions";
    translation_origin?: string;
    slot_key?: string;
  }> = [];

  for (const section of ALL_SECTIONS) {
    const versions = await fetchLatestVersions(supabase, date, section);
    const live = selectLive(versions);

    if (!live) {
      results.push({ section, action: "no-versions" });
      continue;
    }

    const item = rowToTextItem(live, date);

    if (!DRY_RUN) {
      doc = setSectionItem(doc, section, item);
    }

    results.push({
      section,
      action: "set",
      translation_origin: live.translation_origin,
      slot_key: live.slot_key,
    });
  }

  if (!DRY_RUN) {
    // Validate against Zod before saving
    try {
      parseDayDoc(doc);
    } catch (err) {
      logStructuredError(
        { day: date, stage: "write" },
        new Error(`Zod validation failed: ${(err as Error).message}`),
      );
      process.exit(1);
    }
    await saveDayDoc(supabase, date, doc, false);
    console.error(`[update-day-content] Saved day_content.doc for ${date}.`);
  } else {
    console.error(`[dry-run] Would save day_content.doc for ${date}.`);
  }

  const set = results.filter((r) => r.action === "set");
  const missing = results.filter((r) => r.action === "no-versions");

  console.log(
    JSON.stringify({
      date,
      set: set.length,
      no_versions: missing.length,
      dry_run: DRY_RUN,
      sections: results,
    }),
  );
  console.error(
    `[update-day-content] Done. ${set.length} section(s) set for ${date}. ` +
      `Next: open http://localhost:3001/day/${date}`,
  );
}

main().catch((err) => {
  console.error(
    "[update-day-content] Fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
