#!/usr/bin/env npx tsx
/**
 * scripts/translate/fetch-french-alto.ts
 *
 * Fetch the French source text for one issue from Gallica ALTO XML (BnF's own
 * OCR, per page, stitched in reading order) and store it in R2 at
 * {date}/fr-intermediate/gallica-alto.txt.
 *
 * Use this when fetch-french-textebrut.ts is Cloudflare-blocked: ALTO is the
 * same BnF OCR via a different endpoint and usually still responds. Then run
 * translate-day.ts.
 *
 * Usage:
 *   npx tsx scripts/translate/fetch-french-alto.ts --date=1844-08-28
 *   npx tsx scripts/translate/fetch-french-alto.ts --date=1844-08-28 --dry-run
 *   npx tsx scripts/translate/fetch-french-alto.ts --help
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
import {
  fetchAltoToR2,
  effectivePageCount,
} from "../../lib/translate/french-source";

const HELP = `fetch-french-alto — Gallica ALTO OCR → R2

Writes:  {date}/fr-intermediate/gallica-alto.txt
Next:    npx tsx scripts/translate/translate-day.ts --date=YYYY-MM-DD
Use when fetch-french-textebrut.ts is Cloudflare-blocked.

Usage:
  npx tsx scripts/translate/fetch-french-alto.ts --date=YYYY-MM-DD`;

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }

  const date = parseCliDate();
  console.error(`[fetch-french-alto] ${date}: fetching Gallica ALTO OCR → R2`);

  if (!isR2Configured()) {
    logStructuredError(
      { day: date, stage: "fetch_source" },
      new Error("R2 is not configured."),
    );
    process.exit(1);
  }

  const supabase = makeSupabaseClient();
  const doc = await loadDayDoc(supabase, date);
  const log = (msg: string) => console.error(`[fetch-french-alto] ${msg}`);

  let ark: string;
  let pageCount: number;
  try {
    const issue = await resolveIssueForDay(date, doc);
    ark = issue.ark;
    pageCount = effectivePageCount(doc, issue.pageCount);
    log(`ARK: ${ark} (${pageCount} page(s))`);
  } catch (err) {
    logStructuredError({ day: date, stage: "fetch_source" }, err);
    process.exit(1);
  }

  try {
    const result = await fetchAltoToR2({ date, ark, pageCount, log });
    console.log(
      JSON.stringify({
        date,
        ark,
        source_tier: result.sourceTier,
        source_label: result.sourceLabel,
        source_text_url: result.sourceTextUrl,
        r2_key: result.r2Key,
        char_count: result.frenchText.length,
      }),
    );
    console.error(
      `[fetch-french-alto] Done. Wrote ${result.r2Key} (${result.frenchText.length} chars). ` +
        `Next: npx tsx scripts/translate/translate-day.ts --date=${date}`,
    );
  } catch (err) {
    logStructuredError({ day: date, stage: "fetch_source" }, err);
    console.error(
      `[fetch-french-alto] ALTO failed. If page scans are in R2, try vision OCR: ` +
        `npx tsx scripts/translate/transcribe-french-vision.ts --date=${date}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(
    "[fetch-french-alto] Fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
