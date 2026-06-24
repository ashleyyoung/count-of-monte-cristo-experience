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
 *   npx tsx scripts/ingest-day.ts --date=1844-08-29 --skip-existing
 *   npx tsx scripts/ingest-day.ts --help
 */

import "dotenv/config";
import { parseCliDate } from "./gallica/_shared";
import { runResolveIssue } from "./gallica/resolve-issue";
import { runPullScans } from "./gallica/pull-scans";
import { runCropStrip } from "./gallica/crop-strip";
import { fetchTexteBrutToR2 } from "../lib/translate/french-source";
import { runDayTranslation } from "../lib/translate/pipeline";

const SKIP_EXISTING = !process.argv.includes("--force");

function parseCliModel(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--model="));
  return arg ? arg.replace("--model=", "").trim() : undefined;
}

const HELP = `ingest-day — run the full ingest for one date, in order

Steps: resolve-issue → pull-scans → crop-strip → fetch-french-textebrut → translate-day

Translation is saved to day_content incrementally inside the pipeline — no
separate upload step required.

Usage:
  npx tsx scripts/ingest-day.ts --date=YYYY-MM-DD [--force] [--model=<anthropic-model-id>]

  --force   Re-download and overwrite scans/crops already in R2.
            Default is to skip existing files.
  --model   Override TRANSLATION_MODEL for the translate step (e.g. claude-sonnet-4-5).

After it finishes, open http://localhost:3001/day/YYYY-MM-DD`;

function step(n: number, total: number, name: string) {
  console.error(`\n[ingest-day] (${n}/${total}) ${name}`);
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }

  const date = parseCliDate();
  const model = parseCliModel();
  const total = 5;
  console.error(`[ingest-day] ${date}: full ingest, ${total} steps`);

  // 1. resolve-issue
  step(1, total, "resolve-issue");
  const resolved = await runResolveIssue({ day: date });
  console.error(
    `[ingest-day] ARK ${resolved.ark} (${resolved.pageCount} page(s)).`,
  );

  // 2. pull-scans
  step(2, total, "pull-scans");
  await runPullScans({ day: date, skipExisting: SKIP_EXISTING });

  // 3. crop-strip
  step(3, total, "crop-strip");
  await runCropStrip({ day: date, skipExisting: SKIP_EXISTING });

  // 4. fetch-french-textebrut
  step(4, total, "fetch-french-textebrut");
  const log = (msg: string) => console.error(`[ingest-day] ${msg}`);
  await fetchTexteBrutToR2({ date, ark: resolved.ark, log });

  // 5. translate-day (saves to day_content incrementally; no separate upload step)
  step(5, total, "translate-day");
  const summary = await runDayTranslation(date, log, { model });
  console.error(
    `[ingest-day] translate-day: translated=${summary.translated} ` +
      `created=${summary.created} skipped=${summary.skipped} failed=${summary.failed.length}`,
  );

  console.error(`\n[ingest-day] Done. Open http://localhost:3001/day/${date}`);
  process.exit(summary.failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(
    "[ingest-day] Failed:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
