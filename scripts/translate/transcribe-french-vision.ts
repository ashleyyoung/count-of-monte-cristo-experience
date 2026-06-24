#!/usr/bin/env npx tsx
/**
 * scripts/translate/transcribe-french-vision.ts
 *
 * Transcribe the French source text for one issue with the Claude vision model,
 * reading the page scans already in R2 (from pull-scans) and storing the result
 * at {date}/fr-intermediate/vision-issue.txt.
 *
 * This is the last-resort French source: use it only when both
 * fetch-french-textebrut.ts and fetch-french-alto.ts are unavailable. It costs
 * tokens and can be refused by the model's content filter on dense pages. Run
 * pull-scans.ts first, then translate-day.ts after.
 *
 * Usage:
 *   npx tsx scripts/translate/transcribe-french-vision.ts --date=1844-08-28
 *   npx tsx scripts/translate/transcribe-french-vision.ts --date=1844-08-28 --force-fetch
 *   npx tsx scripts/translate/transcribe-french-vision.ts --help
 */

import "dotenv/config";
import {
  parseCliDate,
  makeSupabaseClient,
  loadDayDoc,
  logStructuredError,
  resolveIssueForDay,
} from "../gallica/_shared";
import { isR2Configured } from "../../lib/r2-server";
import { transcribeVisionToR2 } from "../../lib/translate/french-source";

const FORCE_FETCH = process.argv.includes("--force-fetch");

const HELP = `transcribe-french-vision — Claude vision OCR of R2 page scans → R2

Writes:   {date}/fr-intermediate/vision-issue.txt
Requires: page scans in R2 (run pull-scans.ts first) + ANTHROPIC_API_KEY
Next:     npx tsx scripts/translate/translate-day.ts --date=YYYY-MM-DD
Note:     last resort; may be refused by the content filter on dense pages.

Usage:
  npx tsx scripts/translate/transcribe-french-vision.ts --date=YYYY-MM-DD [--force-fetch]`;

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }

  const date = parseCliDate();
  console.error(
    `[transcribe-french-vision] ${date}: vision OCR of R2 page scans → R2`,
  );

  if (!isR2Configured()) {
    logStructuredError(
      { day: date, stage: "fetch_source" },
      new Error("R2 is not configured."),
    );
    process.exit(1);
  }

  const supabase = makeSupabaseClient();
  const doc = await loadDayDoc(supabase, date);
  const log = (msg: string) =>
    console.error(`[transcribe-french-vision] ${msg}`);

  let gallicaUrl: string;
  try {
    ({ gallicaUrl } = await resolveIssueForDay(date, doc));
  } catch (err) {
    logStructuredError({ day: date, stage: "fetch_source" }, err);
    process.exit(1);
  }

  try {
    const result = await transcribeVisionToR2({
      date,
      doc,
      supabase,
      gallicaUrl,
      log,
      forceFetch: FORCE_FETCH,
    });
    console.log(
      JSON.stringify({
        date,
        source_tier: result.sourceTier,
        source_label: result.sourceLabel,
        source_text_url: result.sourceTextUrl,
        r2_key: result.r2Key,
        char_count: result.frenchText.length,
        cost_usd: result.cost_usd,
        low_confidence: result.lowConfidence,
      }),
    );
    console.error(
      `[transcribe-french-vision] Done. Wrote ${result.r2Key} (${result.frenchText.length} chars). ` +
        `Next: npx tsx scripts/translate/translate-day.ts --date=${date}`,
    );
  } catch (err) {
    logStructuredError({ day: date, stage: "fetch_source" }, err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(
    "[transcribe-french-vision] Fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
