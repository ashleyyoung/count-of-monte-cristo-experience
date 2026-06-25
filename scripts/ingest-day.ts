#!/usr/bin/env npx tsx
/**
 * scripts/ingest-day.ts
 *
 * One-command ingest for a single date. Runs the happy path top to bottom:
 *
 *   1. resolve-issue        find the Gallica issue ARK for the date
 *   2. pull-scans           download page images → R2
 *   3. crop-strip           crop the feuilleton strip → R2
 *   4. fetch-french-source  Gallica ALTO French source → R2
 *   5. translate-day        translate French → English, save to day_content
 *
 * Translation is persisted to day_content incrementally (section by section)
 * inside the pipeline — there is no separate upload step.
 *
 * Step 4 uses ALTO, not texteBrut: texteBrut has been hitting BnF's own
 * Altcha bot-challenge page and long genuine Cloudflare outages this season,
 * costing up to ~30min of retries before failing. fetch-french-textebrut.ts
 * still works and can be run by hand if you want to retry it for a date:
 *
 *   npx tsx scripts/translate/fetch-french-textebrut.ts --date=YYYY-MM-DD
 *   npx tsx scripts/translate/translate-day.ts          --date=YYYY-MM-DD
 *
 * Usage:
 *   npx tsx scripts/ingest-day.ts --date=1844-08-29 [--skip-translation] [--force]
 *   npx tsx scripts/ingest-day.ts --help
 */

import "dotenv/config";
import {
  parseCliDate,
  runCliMain,
  waitForGallicaHealthy,
  DEFAULT_COOLDOWN_ON_ERROR_MS,
  sleep,
} from "./gallica/_shared";
import { runResolveIssue } from "./gallica/resolve-issue";
import { runPullScans } from "./gallica/pull-scans";
import { runCropStrip } from "./gallica/crop-strip";
import {
  fetchAltoToR2,
  loadCachedFrench,
} from "../lib/translate/french-source";
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
  const cropResult = await runCropStrip({ day: date, skipExisting });

  // 4. fetch-french-source (ALTO). texteBrut is skipped here for now — it's
  // been hitting BnF's own Altcha bot-challenge page (unsolvable by a
  // non-browser client) and, separately, long genuine Cloudflare/origin
  // outages, costing up to ~30min of retries before failing. ALTO has been
  // reliable throughout. fetchTexteBrutToR2 still exists and works via
  // scripts/translate/fetch-french-textebrut.ts if needed by hand.
  step(4, "fetch-french-source");
  const cachedFrench = skipExisting
    ? await loadCachedFrench(date, resolved.ark, log)
    : null;
  if (!cachedFrench) {
    await fetchAltoToR2({
      date,
      ark: resolved.ark,
      pageCount: resolved.pageCount,
      log,
      page1Blocks: cropResult.page1AltoBlocks,
    });
  }

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

Steps: resolve-issue → pull-scans → crop-strip → fetch-french-source (ALTO) → translate-day

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
  --skip-preflight     Skip the Gallica reachability check before starting.

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

  if (!process.argv.includes("--skip-preflight")) {
    const healthy = await waitForGallicaHealthy((msg) =>
      console.error(`[ingest-day] ${msg}`),
    );
    if (!healthy) {
      console.error(
        `[ingest-day] Gallica preflight failed after retries — cooling down ${DEFAULT_COOLDOWN_ON_ERROR_MS / 1000}s before starting (avoids hammering an already-struggling origin).`,
      );
      await sleep(DEFAULT_COOLDOWN_ON_ERROR_MS);
    }
  }

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
