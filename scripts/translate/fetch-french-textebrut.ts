#!/usr/bin/env npx tsx
/**
 * scripts/translate/fetch-french-textebrut.ts
 *
 * Fetch the French source text for one issue from Gallica texteBrut and store it
 * in R2 at {date}/fr-intermediate/gallica-textebrut.txt.
 *
 * This is the default French source. If Gallica returns HTML (Cloudflare block)
 * or a 403, use fetch-french-alto.ts instead. Then run translate-day.ts.
 *
 * Usage:
 *   npx tsx scripts/translate/fetch-french-textebrut.ts --date=1844-08-28
 *   npx tsx scripts/translate/fetch-french-textebrut.ts --date=1844-08-28 --dry-run
 *   npx tsx scripts/translate/fetch-french-textebrut.ts --help
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
import { fetchTexteBrutToR2 } from "../../lib/translate/french-source";

const HELP = `fetch-french-textebrut — Gallica texteBrut → R2

Writes:   {date}/fr-intermediate/gallica-textebrut.txt
Next:     npx tsx scripts/translate/translate-day.ts --date=YYYY-MM-DD
Fallback: if texteBrut is blocked, run fetch-french-alto.ts instead

Usage:
  npx tsx scripts/translate/fetch-french-textebrut.ts --date=YYYY-MM-DD`;

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }

  const date = parseCliDate();
  console.error(
    `[fetch-french-textebrut] ${date}: fetching Gallica texteBrut → R2`,
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
  const log = (msg: string) => console.error(`[fetch-french-textebrut] ${msg}`);

  let ark: string;
  try {
    ({ ark } = await resolveIssueForDay(date, doc));
    log(`ARK: ${ark}`);
  } catch (err) {
    logStructuredError({ day: date, stage: "fetch_source" }, err);
    process.exit(1);
  }

  try {
    const result = await fetchTexteBrutToR2({ date, ark, log });
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
      `[fetch-french-textebrut] Done. Wrote ${result.r2Key} (${result.frenchText.length} chars). ` +
        `Next: npx tsx scripts/translate/translate-day.ts --date=${date}`,
    );
  } catch (err) {
    logStructuredError({ day: date, stage: "fetch_source" }, err);
    console.error(
      `[fetch-french-textebrut] texteBrut failed. If it is Cloudflare-blocked (HTML/403), try: ` +
        `npx tsx scripts/translate/fetch-french-alto.ts --date=${date}`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(
    "[fetch-french-textebrut] Fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
