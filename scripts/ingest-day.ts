#!/usr/bin/env npx tsx
/**
 * scripts/ingest-day.ts
 *
 * One-command ingest for a single date. Runs the happy path top to bottom:
 *
 *   1. resolve-issue           find the Gallica issue ARK for the date
 *   2. pull-scans              download page images → R2
 *   3. crop-strip              crop the feuilleton strip → R2
 *   4. fetch-french-textebrut  Gallica texteBrut French source → R2
 *   5. translate-day           translate French → English, save to day_content
 *
 * Translation is persisted to day_content incrementally (section by section)
 * inside the pipeline — there is no separate upload step.
 *
 * If the texteBrut step fails (Cloudflare block), fetch an alternative French
 * source by hand and re-run translate-day:
 *
 *   npx tsx scripts/translate/fetch-french-alto.ts --date=YYYY-MM-DD
 *   npx tsx scripts/translate/translate-day.ts      --date=YYYY-MM-DD
 *
 * Usage:
 *   npx tsx scripts/ingest-day.ts --date=1844-08-29 [--skip-translation] [--force]
 *   npx tsx scripts/ingest-day.ts --help
 */

import "dotenv/config";
import { parseCliDate, runCliMain } from "./gallica/_shared";
import { runResolveIssue } from "./gallica/resolve-issue";
import { runPullScans } from "./gallica/pull-scans";
import { runCropStrip } from "./gallica/crop-strip";
import { fetchTexteBrutToR2 } from "../lib/translate/french-source";
import { runDayTranslation } from "../lib/translate/pipeline";
import { getByDate } from "../lib/installments";

// ---------------------------------------------------------------------------
// Exported runner (used by ingest-range.ts)
// ---------------------------------------------------------------------------

export interface IngestDayOptions {
  force?: boolean;
  skipTranslation?: boolean;
  model?: string;
}

export interface IngestDayResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
}

export async function runIngestDay(
  date: string,
  options: IngestDayOptions = {},
): Promise<IngestDayResult> {
  const { force = false, skipTranslation = false, model } = options;
  const skipExisting = !force;

  if (!getByDate(date)) {
    const message = `${date} is not in the Monte Cristo installment schedule`;
    console.error(`[ingest-day] ${message} — skipping.`);
    return { ok: true, skipped: true, message };
  }

  const total = skipTranslation ? 4 : 5;
  const log = (msg: string) => console.error(`[ingest-day] ${date}: ${msg}`);

  log(
    `starting full ingest, ${total} steps` +
      (skipTranslation ? " (translation skipped)" : ""),
  );

  const step = (n: number, name: string) =>
    console.error(`\n[ingest-day] ${date}: (${n}/${total}) ${name}`);

  // 1. resolve-issue
  step(1, "resolve-issue");
  const resolved = await runResolveIssue({ day: date, skipExisting });
  log(`ARK ${resolved.ark} (${resolved.pageCount} page(s)).`);

  // 2. pull-scans
  step(2, "pull-scans");
  await runPullScans({ day: date, skipExisting });

  // 3. crop-strip
  step(3, "crop-strip");
  await runCropStrip({ day: date, skipExisting });

  // 4. fetch-french-textebrut
  step(4, "fetch-french-textebrut");
  await fetchTexteBrutToR2({
    date,
    ark: resolved.ark,
    log,
    skipIfCached: skipExisting,
  });

  if (skipTranslation) {
    log(
      `done (translation skipped). To translate: npx tsx scripts/translate/translate-day.ts --date=${date}`,
    );
    return { ok: true };
  }

  // 5. translate-day
  step(5, "translate-day");
  const summary = await runDayTranslation(date, log, { model });
  log(
    `translate-day done: translated=${summary.translated} ` +
      `created=${summary.created} skipped=${summary.skipped} failed=${summary.failed.length}`,
  );

  if (summary.failed.length > 0) {
    return {
      ok: false,
      message: `${summary.failed.length} section(s) failed to translate`,
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const HELP = `ingest-day — run the full ingest for one date, in order

Steps: resolve-issue → pull-scans → crop-strip → fetch-french-textebrut → translate-day

Translation is saved to day_content incrementally inside the pipeline — no
separate upload step required.

Usage:
  npx tsx scripts/ingest-day.ts --date=YYYY-MM-DD [--force] [--skip-translation] [--model=<id>]

  --force              Re-download and overwrite scans/crops already in R2.
                       Default is to skip existing files.
  --skip-translation   Stop after fetching the French source; skip translate-day.
                       Useful when you want to run translation separately or with a
                       different model later.
  --model              Override TRANSLATION_MODEL for the translate step
                       (e.g. claude-opus-4-8).

After it finishes, open http://localhost:3001/day/YYYY-MM-DD`;

function parseCliModel(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--model="));
  return arg ? arg.replace("--model=", "").trim() : undefined;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }

  const date = parseCliDate();
  const result = await runIngestDay(date, {
    force: process.argv.includes("--force"),
    skipTranslation: process.argv.includes("--skip-translation"),
    model: parseCliModel(),
  });

  if (!result.skipped) {
    console.error(
      `\n[ingest-day] ${date}: done. Open http://localhost:3001/day/${date}`,
    );
  }
  if (!result.ok) process.exit(1);
}

runCliMain(import.meta.url, main, "ingest-day");
