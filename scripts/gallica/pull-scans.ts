#!/usr/bin/env npx tsx
/**
 * scripts/gallica/pull-scans.ts
 *
 * Downloads all full-page scans for a Journal des Débats issue from Gallica's
 * IIIF Image API at native quality and stores them in R2, Supabase media_assets,
 * and doc.original_pages.
 *
 * Usage:
 *   npx tsx scripts/gallica/pull-scans.ts --date=1844-08-28
 *   npx tsx scripts/gallica/pull-scans.ts --date=1844-08-28 --skip-existing
 *   npx tsx scripts/gallica/pull-scans.ts --date=1844-08-28 --dry-run
 */

import {
  fetchIIIFPage,
  fetchIIIFDimensions,
  pixelRegion,
} from "../../lib/gallica";
import { putR2Object, r2ObjectExists } from "../../lib/r2-server";
import {
  makeSupabaseClient,
  loadDayDoc,
  saveDayDoc,
  insertMediaAsset,
  resolveIssueForDay,
  parseCliDate,
  DRY_RUN,
  SKIP_EXISTING,
  REFRESH_GALLICA_CACHE,
  logStructuredError,
  sleep,
  IIIF_FULL_DELAY_MS,
  type GallicaStepOptions,
} from "./_shared";
import type { ImageItem } from "../../lib/types/content";

const LICENSE = "Public Domain";
const ATTRIBUTION_PREFIX = "Journal des Débats politiques et littéraires";
const SOURCE_LABEL = "Gallica / Bibliothèque nationale de France";

function pageR2Key(day: string, page: number): string {
  return `gallica/${day}/page-${page}.jpg`;
}

function existingPageItem(
  pages: ImageItem[],
  page: number,
): ImageItem | undefined {
  return pages[page - 1];
}

export interface PullScansPageSummary {
  page: number;
  r2Key: string;
  mediaAssetId: string;
  skipped?: boolean;
}

export interface PullScansResult {
  day: string;
  ark: string;
  pageCount: number;
  pages: PullScansPageSummary[];
  dryRun: boolean;
}

export async function runPullScans(
  options: GallicaStepOptions,
): Promise<PullScansResult> {
  const {
    day,
    dryRun = false,
    skipExisting = false,
    refreshGallicaCache = false,
  } = options;
  const supabase = makeSupabaseClient();

  let doc = await loadDayDoc(supabase, day);
  const { ark, pageCount, gallicaUrl } = await resolveIssueForDay(day, doc, {
    refresh: refreshGallicaCache,
  });

  if (!doc.gallica_issue_url) {
    doc.gallica_issue_url = gallicaUrl;
  }
  if (doc.gallica_page_count == null) {
    doc.gallica_page_count = pageCount;
  }

  const pages: ImageItem[] = [...doc.original_pages];
  const summary: PullScansPageSummary[] = [];
  let fetchedSinceLastDelay = 0;

  for (let page = 1; page <= pageCount; page++) {
    const r2Key = pageR2Key(day, page);
    const pageUrl = `${gallicaUrl}/f${page}`;
    const priorItem = existingPageItem(pages, page);

    let alreadyInR2 = false;
    if (!dryRun) {
      alreadyInR2 = await r2ObjectExists(r2Key);
    }

    if (
      skipExisting &&
      alreadyInR2 &&
      priorItem?.media_asset_id &&
      priorItem.kind === "image"
    ) {
      console.log(
        `[pull-scans] Skipping page ${page}/${pageCount} (already in R2 and doc)`,
      );
      summary.push({
        page,
        r2Key,
        mediaAssetId: priorItem.media_asset_id,
        skipped: true,
      });
      continue;
    }

    let mediaAssetId = priorItem?.media_asset_id ?? "";
    let dims = { width: 0, height: 0 };

    if (skipExisting && alreadyInR2) {
      console.log(
        `[pull-scans] Skipping IIIF fetch for page ${page}/${pageCount} (already in R2; repairing doc)`,
      );
    } else {
      if (fetchedSinceLastDelay > 0) {
        console.log(
          `[pull-scans] Waiting ${IIIF_FULL_DELAY_MS / 1000}s before page ${page}…`,
        );
        await sleep(IIIF_FULL_DELAY_MS);
      }

      console.log(
        `[pull-scans] Fetching page ${page}/${pageCount} for ${day}…`,
      );
      const imageBuffer = await fetchIIIFPage(ark, page);
      fetchedSinceLastDelay++;

      try {
        dims = await fetchIIIFDimensions(ark, page);
      } catch {
        dims = { width: 0, height: 0 };
      }

      if (dryRun) {
        console.log(`[dry-run] Would upload ${r2Key} to R2`);
      } else {
        await putR2Object(r2Key, imageBuffer, "image/jpeg");
      }
    }

    const iiifRegion =
      dims.width > 0
        ? pixelRegion({ x: 0, y: 0, w: dims.width, h: dims.height })
        : null;

    if (!mediaAssetId) {
      mediaAssetId = await insertMediaAsset(
        supabase,
        {
          kind: "scan",
          title: `Journal des Débats — ${day} — page ${page}`,
          caption: `${ATTRIBUTION_PREFIX}, ${day}, page ${page} of ${pageCount}`,
          source: SOURCE_LABEL,
          source_url: pageUrl,
          iiif_region: iiifRegion,
          license: LICENSE,
          attribution: `${ATTRIBUTION_PREFIX}, ${day} — Gallica / BnF`,
          r2_key: r2Key,
          download_blocked: false,
        },
        dryRun,
      );
    }

    const pageItem: ImageItem = {
      kind: "image",
      media_asset_id: mediaAssetId,
      caption: `Journal des Débats, ${day} — page ${page} of ${pageCount}`,
    };

    if (pages.length < page) {
      pages.length = page;
    }
    pages[page - 1] = pageItem;
    doc.original_pages = pages;

    await saveDayDoc(supabase, day, doc, dryRun);

    summary.push({
      page,
      r2Key,
      mediaAssetId,
      skipped: skipExisting && alreadyInR2 ? true : undefined,
    });
    console.log(`[pull-scans] Page ${page} done → ${r2Key}`);
  }

  return { day, ark, pageCount, pages: summary, dryRun };
}

async function main() {
  const day = parseCliDate();
  try {
    const summary = await runPullScans({
      day,
      dryRun: DRY_RUN,
      skipExisting: SKIP_EXISTING,
      refreshGallicaCache: REFRESH_GALLICA_CACHE,
    });
    console.log(JSON.stringify(summary));
  } catch (err) {
    logStructuredError({ day, stage: "pull-scans" }, err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[pull-scans] Unexpected error:", err);
  process.exit(1);
});
