#!/usr/bin/env npx tsx
/**
 * scripts/gallica/alto-ocr.ts
 *
 * Fetches Gallica's pre-existing ALTO XML for a page of the Journal des Débats
 * (Gallica has already OCR'd the text; this script parses that structured output),
 * extracts text-block bounding boxes, and auto-derives the IIIF region for the
 * page-1 feuilleton strip.
 *
 * This is primarily a diagnostic / setup tool:
 *  - Inspect block layout before running crop-strip.ts
 *  - Determine the correct --region=x,y,w,h for difficult issues
 *  - Verify OCR coverage per page
 *
 * No R2 or DB writes. Safe to run repeatedly.
 *
 * Usage:
 *   npx tsx scripts/gallica/alto-ocr.ts --date=1844-08-28
 *   npx tsx scripts/gallica/alto-ocr.ts --date=1844-08-28 --page=2
 *   npx tsx scripts/gallica/alto-ocr.ts --date=1844-08-28 --json        # compact JSON output
 *   npx tsx scripts/gallica/alto-ocr.ts --date=1844-08-28 --ark=bpt6k446670p  # skip ARK lookup
 *
 * Output (stdout):
 *   - Page dimensions
 *   - List of TextBlocks with id, x, y, w, h, text snippet
 *   - Derived feuilleton region (page 1 only), or a message if not derivable
 *   - Suggested --region= flag for crop-strip.ts
 *
 * On failure: JSON error { error, day, page, stage, message } → exits 1
 */

import "dotenv/config";
import {
  resolveIssueArk,
  fetchIIIFDimensions,
  fetchAltoXml,
  parseAltoXml,
  deriveFeuilletonRegion,
  pixelRegion,
  DEBATS_PERIODICAL_ARK,
  type AltoTextBlock,
  type IIIFDimensions,
} from "../../lib/gallica";
import {
  parseCliDate,
  parseCliPage,
  logStructuredError,
  sleep,
  ALTO_DELAY_MS,
} from "./_shared";

const JSON_MODE = process.argv.includes("--json");
const FEUILLETON_PAGE = 1;

/** Parse an optional --ark=xxx flag to skip the ARK resolution step. */
function parseCliArk(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--ark="));
  return arg ? arg.replace("--ark=", "") : undefined;
}

/** Print a human-readable summary of ALTO blocks. */
function printBlocksSummary(
  blocks: AltoTextBlock[],
  dims: IIIFDimensions,
  page: number,
): void {
  console.log(`\nPage ${page} dimensions: ${dims.width} × ${dims.height} px`);
  console.log(`TextBlocks: ${blocks.length}\n`);

  const sorted = [...blocks].sort((a, b) => a.y - b.y);
  for (const b of sorted) {
    const snippet = b.text.slice(0, 60).replace(/\s+/g, " ");
    const ellipsis = b.text.length > 60 ? "…" : "";
    console.log(
      `  [${b.id}]  x=${b.x} y=${b.y} w=${b.w} h=${b.h}` +
        `  "${snippet}${ellipsis}"`,
    );
  }
}

async function main() {
  const day = parseCliDate();
  const targetPage = parseCliPage() ?? FEUILLETON_PAGE;
  const manualArk = parseCliArk();

  // ── 1. Resolve ARK (unless provided) ──
  let ark: string;
  if (manualArk) {
    ark = manualArk;
    console.log(`[alto-ocr] Using provided ARK: ${ark}`);
  } else {
    try {
      const result = await resolveIssueArk(DEBATS_PERIODICAL_ARK, day);
      if (!result) {
        logStructuredError(
          { day, page: targetPage, stage: "resolve-issue" },
          new Error(`No Gallica issue found for Journal des Débats on ${day}`),
        );
        process.exit(1);
      }
      ark = result.ark;
      console.log(
        `[alto-ocr] Resolved ARK: ${ark} (${result.pageCount} pages)`,
      );
    } catch (err) {
      logStructuredError(
        { day, page: targetPage, stage: "resolve-issue" },
        err,
      );
      process.exit(1);
    }
  }

  // ── 2. Fetch page dimensions ──
  let dims: IIIFDimensions;
  try {
    dims = await fetchIIIFDimensions(ark, targetPage);
  } catch (err) {
    logStructuredError({ day, page: targetPage, stage: "iiif-info" }, err);
    process.exit(1);
  }

  // ── 3. Fetch and parse ALTO XML ──
  await sleep(ALTO_DELAY_MS);
  let altoXml: string;
  try {
    console.log(`[alto-ocr] Fetching ALTO XML for page ${targetPage}…`);
    altoXml = await fetchAltoXml(ark, targetPage);
  } catch (err) {
    logStructuredError({ day, page: targetPage, stage: "alto-fetch" }, err);
    process.exit(1);
  }

  const blocks = parseAltoXml(altoXml);

  if (blocks.length === 0) {
    logStructuredError(
      { day, page: targetPage, stage: "alto-parse" },
      new Error(
        "ALTO XML parsed with 0 TextBlocks. " +
          "This page may not have OCR data, or the ALTO format is unexpected.",
      ),
    );
    process.exit(1);
  }

  // ── 4. Derive feuilleton region (page 1 only) ──
  const derived =
    targetPage === FEUILLETON_PAGE
      ? deriveFeuilletonRegion(blocks, dims)
      : null;

  // ── 5. Output ──
  if (JSON_MODE) {
    const output = {
      day,
      ark,
      page: targetPage,
      dimensions: dims,
      blockCount: blocks.length,
      blocks: blocks.map((b) => ({ ...b, textSnippet: b.text.slice(0, 80) })),
      feuilletonRegion: derived ? pixelRegion(derived) : null,
      suggestedCropFlag: derived ? `--region=${pixelRegion(derived)}` : null,
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    printBlocksSummary(blocks, dims, targetPage);

    if (targetPage === FEUILLETON_PAGE) {
      if (derived) {
        console.log(`\n✓ Derived feuilleton region: ${pixelRegion(derived)}`);
        console.log(`  Suggested flag for crop-strip.ts:`);
        console.log(`    --region=${pixelRegion(derived)}`);
      } else {
        console.log(
          "\n✗ Could not auto-derive feuilleton region from ALTO data.",
        );
        console.log(
          "  The largest vertical gap may be too small, or in the upper half of the page.",
        );
        console.log(
          "  Review the block positions above and pass --region=x,y,w,h manually.",
        );
      }
    }
  }
}

main().catch((err) => {
  console.error("[alto-ocr] Unexpected error:", err);
  process.exit(1);
});
