#!/usr/bin/env npx tsx
/**
 * scripts/translate/extract-text.ts
 *
 * Fetch and store the French source text(s) for a given installment date,
 * following the source hierarchy from README_translation_architecture.md:
 *
 *   Tier 1: FMC Project transcriptions (hand-corrected music criticism)
 *           → not yet implemented; add when corpus API is available
 *   Tier 2: Europeana Newspapers OLR JSON (article-segmented)
 *           → not yet implemented; add when confirmed 1844-46 Débats coverage
 *   Tier 3: Gallica texteBrut (always available; whole-issue OCR baseline)  ← current
 *   Tier 4: Vision-model transcription (on-demand admin trigger; never batch)
 *
 * On any failure, logs a structured error and exits 1 — no silent fallbacks.
 *
 * Usage:
 *   npx tsx scripts/translate/extract-text.ts --date=1844-08-28 [--dry-run]
 *
 * Outputs:
 *   R2 key: {date}/fr-intermediate/gallica-textebrut.txt
 *   Stdout: JSON with { date, source_tier, source_text_url, r2_key, char_count }
 */

import "dotenv/config";
import {
  parseCliDate,
  DRY_RUN,
  logStructuredError,
  sleep,
  TEXTEBRUT_DELAY_MS,
} from "../gallica/_shared";
import {
  resolveIssueArk,
  fetchTexteBrut,
  texteBrutUrl,
  DEBATS_PERIODICAL_ARK,
} from "../../lib/gallica";
import { putR2Text, isR2Configured } from "../../lib/r2-server";

async function main() {
  const date = parseCliDate();
  console.error(
    `[extract-text] Processing ${date}${DRY_RUN ? " (dry-run)" : ""}…`,
  );

  // -----------------------------------------------------------------------
  // Tier 3: Gallica texteBrut (always-available baseline)
  // -----------------------------------------------------------------------
  console.error(`[extract-text] Resolving Gallica ARK for ${date}…`);
  const issueInfo = await resolveIssueArk(DEBATS_PERIODICAL_ARK, date);
  if (!issueInfo) {
    logStructuredError(
      { day: date, stage: "fetch_source" },
      new Error(
        `No Gallica issue found for ${date}. ` +
          `Verify that the Débats periodical ARK (${DEBATS_PERIODICAL_ARK}) ` +
          `covers this date and that the Issues service is available.`,
      ),
    );
    process.exit(1);
  }
  const { ark } = issueInfo;
  console.error(`[extract-text] ARK: ${ark}`);

  await sleep(TEXTEBRUT_DELAY_MS);

  console.error(`[extract-text] Fetching texteBrut…`);
  const frenchText = await fetchTexteBrut(ark);

  if (!frenchText || frenchText.trim().length < 200) {
    logStructuredError(
      { day: date, stage: "fetch_source" },
      new Error(
        `texteBrut returned suspiciously short or empty content (${frenchText?.length ?? 0} chars) ` +
          `for ARK ${ark}. Check Gallica availability or OCR coverage.`,
      ),
    );
    process.exit(1);
  }

  const sourceTextUrl = texteBrutUrl(ark);
  const r2Key = `${date}/fr-intermediate/gallica-textebrut.txt`;

  console.error(
    `[extract-text] Fetched ${frenchText.length} chars from texteBrut.`,
  );

  // -----------------------------------------------------------------------
  // Store on R2
  // -----------------------------------------------------------------------
  if (!DRY_RUN) {
    if (!isR2Configured()) {
      logStructuredError(
        { day: date, stage: "fetch_source" },
        new Error(
          "R2 is not configured. Set CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, " +
            "R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and NEXT_PUBLIC_R2_PUBLIC_URL.",
        ),
      );
      process.exit(1);
    }
    await putR2Text(r2Key, frenchText);
    console.error(`[extract-text] Written to R2: ${r2Key}`);
  } else {
    console.error(`[dry-run] Would write to R2: ${r2Key}`);
  }

  // -----------------------------------------------------------------------
  // Output result JSON (stdout)
  // -----------------------------------------------------------------------
  console.log(
    JSON.stringify({
      date,
      source_tier: 3,
      source_label: "Gallica texteBrut",
      source_text_url: sourceTextUrl,
      ark,
      r2_key: r2Key,
      char_count: frenchText.length,
      dry_run: DRY_RUN,
    }),
  );
}

main().catch((err) => {
  console.error(
    "[extract-text] Fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
