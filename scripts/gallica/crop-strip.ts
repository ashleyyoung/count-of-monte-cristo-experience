#!/usr/bin/env npx tsx
/**
 * scripts/gallica/crop-strip.ts
 *
 * Crops the page-1 feuilleton strip from a Journal des Débats issue and stores
 * it in R2, Supabase media_assets, and doc.feuilleton_strip.
 */

import "dotenv/config";
import {
  fetchIIIFPage,
  fetchIIIFManifestDimensions,
  fetchAltoXml,
  parseAltoXml,
  deriveFeuilletonRegion,
  pixelRegion,
  type PixelRegion,
  type AltoTextBlock,
} from "../../lib/gallica";
import { putR2Object, r2ObjectExists } from "../../lib/r2-server";
import {
  makeSupabaseClient,
  loadDayDoc,
  saveDayDoc,
  insertMediaAsset,
  resolveIssueForDay,
  parseCliDate,
  parseCliRegion,
  DRY_RUN,
  SKIP_EXISTING,
  REFRESH_GALLICA_CACHE,
  logStructuredError,
  runCliMain,
  sleep,
  ALTO_DELAY_MS,
  IIIF_FULL_DELAY_MS,
  type GallicaStepOptions,
} from "./_shared";
import type { ImageItem } from "../../lib/types/content";

const LICENSE = "Public Domain";
const SOURCE_LABEL = "Gallica / Bibliothèque nationale de France";
const FEUILLETON_PAGE = 1;

export interface CropStripResult {
  day: string;
  ark: string;
  region: string;
  r2Key: string;
  mediaAssetId: string;
  dryRun: boolean;
  skipped?: boolean;
  /**
   * Page-1 ALTO TextBlocks, when fetched during region derivation (i.e. not
   * a --region= manual override or an early --skip-existing return). Lets
   * fetch-french-source reuse this instead of re-fetching the same page from
   * Gallica a few seconds later.
   */
  page1AltoBlocks?: AltoTextBlock[];
}

export interface CropStripOptions extends GallicaStepOptions {
  manualRegion?: PixelRegion;
}

export async function runCropStrip(
  options: CropStripOptions,
): Promise<CropStripResult> {
  const {
    day,
    dryRun = false,
    skipExisting = false,
    refreshGallicaCache = false,
    manualRegion,
  } = options;
  const supabase = makeSupabaseClient();

  let doc = await loadDayDoc(supabase, day);
  const { ark, gallicaUrl } = await resolveIssueForDay(day, doc, {
    refresh: refreshGallicaCache,
  });

  const r2Key = `gallica/${day}/feuilleton-strip.jpg`;

  // Early exit before any Gallica requests if the strip is already present.
  if (
    skipExisting &&
    doc.feuilleton_strip?.kind === "image" &&
    doc.feuilleton_strip.media_asset_id
  ) {
    const alreadyInR2 = dryRun || (await r2ObjectExists(r2Key));
    if (alreadyInR2) {
      console.log(
        `[crop-strip] Skipping ${day} (feuilleton strip already present)`,
      );
      return {
        day,
        ark,
        region: "",
        r2Key,
        mediaAssetId: doc.feuilleton_strip.media_asset_id,
        skipped: true,
        dryRun,
      };
    }
  }

  let cropRegion: PixelRegion;
  let page1AltoBlocks: AltoTextBlock[] | undefined;

  if (manualRegion) {
    console.log(
      `[crop-strip] Using manual region: ${pixelRegion(manualRegion)}`,
    );
    cropRegion = manualRegion;
  } else {
    const dimsByPage = await fetchIIIFManifestDimensions(ark);
    const dims = dimsByPage.get(FEUILLETON_PAGE);
    if (!dims) {
      throw new Error(
        `manifest.json missing dimensions for page ${FEUILLETON_PAGE} of ${ark}. ` +
          "Pass --region=x,y,w,h to provide a manual region.",
      );
    }

    await sleep(ALTO_DELAY_MS);
    console.log(`[crop-strip] Fetching ALTO XML for page ${FEUILLETON_PAGE}…`);
    const altoXml = await fetchAltoXml(ark, FEUILLETON_PAGE);

    const blocks = parseAltoXml(altoXml);
    if (blocks.length === 0) {
      throw new Error(
        "ALTO XML parsed with 0 TextBlocks. Pass --region=x,y,w,h to provide a manual region.",
      );
    }

    const derived = deriveFeuilletonRegion(blocks, dims);
    if (!derived) {
      throw new Error(
        `Could not auto-derive feuilleton region from ALTO data for ${day}. ` +
          "Run alto-ocr.ts to inspect the blocks, then pass --region=x,y,w,h.",
      );
    }

    cropRegion = derived;
    page1AltoBlocks = blocks;
    console.log(
      `[crop-strip] Derived feuilleton region from ALTO: ${pixelRegion(cropRegion)}`,
    );
  }

  const regionStr = pixelRegion(cropRegion);

  console.log(
    `[crop-strip] Waiting ${IIIF_FULL_DELAY_MS / 1000}s before feuilleton crop…`,
  );
  await sleep(IIIF_FULL_DELAY_MS);
  console.log(`[crop-strip] Fetching feuilleton crop for ${day}…`);
  const imageBuffer = await fetchIIIFPage(ark, FEUILLETON_PAGE, regionStr);

  if (dryRun) {
    console.log(`[dry-run] Would upload ${r2Key} to R2`);
  } else {
    await putR2Object(r2Key, imageBuffer, "image/jpeg");
  }

  const mediaAssetId = await insertMediaAsset(
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
    dryRun,
  );

  const stripItem: ImageItem = {
    kind: "image",
    media_asset_id: mediaAssetId,
    caption: `Le Feuilleton du Journal des Débats, ${day}`,
  };
  doc.feuilleton_strip = stripItem;

  if (!doc.gallica_issue_url) {
    doc.gallica_issue_url = gallicaUrl;
  }

  await saveDayDoc(supabase, day, doc, dryRun);

  return {
    day,
    ark,
    region: regionStr,
    r2Key,
    mediaAssetId,
    dryRun,
    page1AltoBlocks,
  };
}

const HELP = `crop-strip — crop the page-1 feuilleton strip → R2

Writes: the strip image in R2 + doc.feuilleton_strip
Next:   npx tsx scripts/translate/fetch-french-textebrut.ts --date=YYYY-MM-DD

Usage:
  npx tsx scripts/gallica/crop-strip.ts --date=YYYY-MM-DD [--skip-existing]`;

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const day = parseCliDate();
  console.error(`[crop-strip] ${day}: cropping feuilleton strip → R2`);
  try {
    const summary = await runCropStrip({
      day,
      dryRun: DRY_RUN,
      skipExisting: SKIP_EXISTING,
      refreshGallicaCache: REFRESH_GALLICA_CACHE,
      manualRegion: parseCliRegion(),
    });
    console.log(JSON.stringify(summary));
    console.error(
      `[crop-strip] Done. Strip stored for ${day}. ` +
        `Next: npx tsx scripts/translate/fetch-french-textebrut.ts --date=${day}`,
    );
  } catch (err) {
    logStructuredError(
      { day, page: FEUILLETON_PAGE, stage: "crop-strip" },
      err,
    );
    process.exit(1);
  }
}

runCliMain(import.meta.url, main, "crop-strip");
