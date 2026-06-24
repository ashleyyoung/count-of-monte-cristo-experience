#!/usr/bin/env npx tsx
/**
 * scripts/gallica/crop-strip.ts
 *
 * Crops the page-1 feuilleton strip from a Journal des Débats issue and stores
 * it in R2, Supabase media_assets, and doc.feuilleton_strip.
 *
 * The crop region is auto-derived from page-1 ALTO XML (heuristic: largest
 * vertical gap). Pass --region=x,y,w,h to override with a manual pixel region
 * when the ALTO heuristic produces a bad result.
 *
 * Usage:
 *   npx tsx scripts/gallica/crop-strip.ts --date=1844-08-28
 *   npx tsx scripts/gallica/crop-strip.ts --date=1844-08-28 --region=100,5950,5000,1550
 *   npx tsx scripts/gallica/crop-strip.ts --date=1844-08-28 --dry-run
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, R2_BUCKET_NAME
 *
 * Output:
 *   On success: JSON summary { day, ark, region, r2Key, mediaAssetId }
 *   On failure: JSON error   { error, day, page, stage, message }  →  exits 1
 */

import {
  resolveIssueArk,
  fetchIIIFPage,
  fetchIIIFDimensions,
  fetchAltoXml,
  parseAltoXml,
  deriveFeuilletonRegion,
  gallicaPermalink,
  pixelRegion,
  DEBATS_PERIODICAL_ARK,
  type PixelRegion,
} from "../../lib/gallica";
import { putR2Object, r2ObjectExists } from "../../lib/r2-server";
import {
  makeSupabaseClient,
  loadDayDoc,
  saveDayDoc,
  insertMediaAsset,
  parseCliDate,
  parseCliRegion,
  DRY_RUN,
  SKIP_EXISTING,
  logStructuredError,
  sleep,
  ALTO_DELAY_MS,
} from "./_shared";
import type { ImageItem } from "../../lib/types/content";

const LICENSE = "Public Domain";
const SOURCE_LABEL = "Gallica / Bibliothèque nationale de France";
const FEUILLETON_PAGE = 1;

async function main() {
  const day = parseCliDate();
  const manualRegion = parseCliRegion();
  const supabase = makeSupabaseClient();

  // ── 1. Resolve issue ARK ──
  let ark: string;
  try {
    const result = await resolveIssueArk(DEBATS_PERIODICAL_ARK, day);
    if (!result) {
      logStructuredError(
        { day, page: FEUILLETON_PAGE, stage: "resolve-issue" },
        new Error(`No Gallica issue found for Journal des Débats on ${day}`),
      );
      process.exit(1);
    }
    ark = result.ark;
  } catch (err) {
    logStructuredError(
      { day, page: FEUILLETON_PAGE, stage: "resolve-issue" },
      err,
    );
    process.exit(1);
  }

  const gallicaUrl = gallicaPermalink(ark);

  // ── 2. Determine crop region ──
  let cropRegion: PixelRegion;

  if (manualRegion) {
    console.log(
      `[crop-strip] Using manual region: ${pixelRegion(manualRegion)}`,
    );
    cropRegion = manualRegion;
  } else {
    // 2a. Get page dimensions via info.json
    let dims;
    try {
      dims = await fetchIIIFDimensions(ark, FEUILLETON_PAGE);
    } catch (err) {
      logStructuredError(
        { day, page: FEUILLETON_PAGE, stage: "iiif-info" },
        err,
      );
      process.exit(1);
    }

    // 2b. Fetch and parse ALTO XML for page 1
    await sleep(ALTO_DELAY_MS);
    let altoXml: string;
    try {
      console.log(
        `[crop-strip] Fetching ALTO XML for page ${FEUILLETON_PAGE}…`,
      );
      altoXml = await fetchAltoXml(ark, FEUILLETON_PAGE);
    } catch (err) {
      logStructuredError(
        { day, page: FEUILLETON_PAGE, stage: "alto-fetch" },
        err,
      );
      process.exit(1);
    }

    const blocks = parseAltoXml(altoXml);
    if (blocks.length === 0) {
      logStructuredError(
        { day, page: FEUILLETON_PAGE, stage: "alto-parse" },
        new Error(
          "ALTO XML parsed with 0 TextBlocks. Pass --region=x,y,w,h to provide a manual region.",
        ),
      );
      process.exit(1);
    }

    // 2c. Derive feuilleton region from ALTO blocks
    const derived = deriveFeuilletonRegion(blocks, dims);
    if (!derived) {
      logStructuredError(
        { day, page: FEUILLETON_PAGE, stage: "derive-region" },
        new Error(
          `Could not auto-derive feuilleton region from ALTO data for ${day}. ` +
            "Run alto-ocr.ts to inspect the blocks, then pass --region=x,y,w,h.",
        ),
      );
      process.exit(1);
    }

    cropRegion = derived;
    console.log(
      `[crop-strip] Derived feuilleton region from ALTO: ${pixelRegion(cropRegion)}`,
    );
  }

  const regionStr = pixelRegion(cropRegion);
  const r2Key = `gallica/${day}/feuilleton-strip.jpg`;

  let doc;
  try {
    doc = await loadDayDoc(supabase, day);
  } catch (err) {
    logStructuredError({ day, stage: "load-doc" }, err);
    process.exit(1);
  }

  if (
    SKIP_EXISTING &&
    doc.feuilleton_strip?.kind === "image" &&
    doc.feuilleton_strip.media_asset_id
  ) {
    let alreadyInR2 = false;
    if (!DRY_RUN) {
      try {
        alreadyInR2 = await r2ObjectExists(r2Key);
      } catch (err) {
        logStructuredError(
          { day, page: FEUILLETON_PAGE, stage: "r2-head" },
          err,
        );
        process.exit(1);
      }
    }
    if (DRY_RUN || alreadyInR2) {
      console.log(
        `[crop-strip] Skipping ${day} (feuilleton strip already present)`,
      );
      console.log(
        JSON.stringify({
          day,
          ark,
          region: regionStr,
          r2Key,
          mediaAssetId: doc.feuilleton_strip.media_asset_id,
          skipped: true,
          dryRun: DRY_RUN,
        }),
      );
      return;
    }
  }

  // ── 3. Download the cropped strip via IIIF ──
  let imageBuffer: Buffer;
  try {
    console.log(`[crop-strip] Fetching feuilleton crop for ${day}…`);
    imageBuffer = await fetchIIIFPage(ark, FEUILLETON_PAGE, regionStr);
  } catch (err) {
    logStructuredError(
      { day, page: FEUILLETON_PAGE, stage: "iiif-crop-fetch" },
      err,
    );
    process.exit(1);
  }

  // ── 4. Upload to R2 ──
  if (DRY_RUN) {
    console.log(`[dry-run] Would upload ${r2Key} to R2`);
  } else {
    try {
      await putR2Object(r2Key, imageBuffer, "image/jpeg");
    } catch (err) {
      logStructuredError(
        { day, page: FEUILLETON_PAGE, stage: "r2-upload" },
        err,
      );
      process.exit(1);
    }
  }

  // ── 5. Insert media_assets row ──
  let mediaAssetId: string;
  try {
    mediaAssetId = await insertMediaAsset(
      supabase,
      {
        kind: "scan",
        title: `Journal des Débats — ${day} — feuilleton strip`,
        caption: `Feuilleton strip, Journal des Débats, ${day} (page 1 crop)`,
        source: SOURCE_LABEL,
        source_url: `${gallicaUrl}/f${FEUILLETON_PAGE}`,
        iiif_region: regionStr,
        license: LICENSE,
        attribution: `Journal des Débats politiques et littéraires, ${day} — Gallica / BnF`,
        r2_key: r2Key,
        download_blocked: false,
      },
      DRY_RUN,
    );
  } catch (err) {
    logStructuredError(
      { day, page: FEUILLETON_PAGE, stage: "media-assets-insert" },
      err,
    );
    process.exit(1);
  }

  // ── 6. Update doc.feuilleton_strip and save ──
  const stripItem: ImageItem = {
    kind: "image",
    media_asset_id: mediaAssetId,
    caption: `Le Feuilleton du Journal des Débats, ${day}`,
  };
  doc.feuilleton_strip = stripItem;

  if (!doc.gallica_issue_url) {
    doc.gallica_issue_url = gallicaUrl;
  }

  try {
    await saveDayDoc(supabase, day, doc, DRY_RUN);
  } catch (err) {
    logStructuredError({ day, stage: "save-doc" }, err);
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      day,
      ark,
      region: regionStr,
      r2Key,
      mediaAssetId,
      dryRun: DRY_RUN,
    }),
  );
}

main().catch((err) => {
  console.error("[crop-strip] Unexpected error:", err);
  process.exit(1);
});
