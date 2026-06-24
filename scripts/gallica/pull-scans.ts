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
 *
 * Environment:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, R2_BUCKET_NAME
 *
 * Rate limit: Gallica allows 5 full/full IIIF requests per minute. This script
 * waits IIIF_FULL_DELAY_MS (13 s) between page downloads automatically.
 *
 * Idempotency: each page is uploaded to R2 and doc.original_pages is saved
 * immediately after that page completes. With --skip-existing, pages already
 * present in R2 are skipped (doc entries are repaired if missing).
 *
 * Output:
 *   On success: JSON summary { day, ark, pages: [ { page, r2Key, mediaAssetId, skipped? } ] }
 *   On failure: JSON error   { error, day, page, stage, message }  →  exits 1
 */

import {
  resolveIssueArk,
  fetchIIIFPage,
  fetchIIIFDimensions,
  gallicaPermalink,
  pixelRegion,
  DEBATS_PERIODICAL_ARK,
} from "../../lib/gallica";
import { putR2Object, r2ObjectExists } from "../../lib/r2-server";
import {
  makeSupabaseClient,
  loadDayDoc,
  saveDayDoc,
  insertMediaAsset,
  parseCliDate,
  DRY_RUN,
  SKIP_EXISTING,
  logStructuredError,
  sleep,
  IIIF_FULL_DELAY_MS,
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

async function main() {
  const day = parseCliDate();
  const supabase = makeSupabaseClient();

  // ── 1. Resolve issue ARK + page count ──
  let ark: string;
  let pageCount: number;
  try {
    const result = await resolveIssueArk(DEBATS_PERIODICAL_ARK, day);
    if (!result) {
      logStructuredError(
        { day, stage: "resolve-issue" },
        new Error(`No Gallica issue found for Journal des Débats on ${day}`),
      );
      process.exit(1);
    }
    ark = result.ark;
    pageCount = result.pageCount;
  } catch (err) {
    logStructuredError({ day, stage: "resolve-issue" }, err);
    process.exit(1);
  }

  // ── 2. Load existing doc ──
  let doc;
  try {
    doc = await loadDayDoc(supabase, day);
  } catch (err) {
    logStructuredError({ day, stage: "load-doc" }, err);
    process.exit(1);
  }

  const gallicaUrl = gallicaPermalink(ark);
  if (!doc.gallica_issue_url) {
    doc.gallica_issue_url = gallicaUrl;
  }

  const pages: ImageItem[] = [...doc.original_pages];
  const summary: Array<{
    page: number;
    r2Key: string;
    mediaAssetId: string;
    skipped?: boolean;
  }> = [];

  let fetchedSinceLastDelay = 0;

  // ── 3. Download each page ──
  for (let page = 1; page <= pageCount; page++) {
    const r2Key = pageR2Key(day, page);
    const pageUrl = `${gallicaUrl}/f${page}`;
    const priorItem = existingPageItem(pages, page);

    let alreadyInR2 = false;
    if (!DRY_RUN) {
      try {
        alreadyInR2 = await r2ObjectExists(r2Key);
      } catch (err) {
        logStructuredError({ day, page, stage: "r2-head" }, err);
        process.exit(1);
      }
    }

    if (
      SKIP_EXISTING &&
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

    if (SKIP_EXISTING && alreadyInR2) {
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

      let imageBuffer: Buffer;
      try {
        console.log(
          `[pull-scans] Fetching page ${page}/${pageCount} for ${day}…`,
        );
        imageBuffer = await fetchIIIFPage(ark, page);
      } catch (err) {
        logStructuredError({ day, page, stage: "iiif-fetch" }, err);
        process.exit(1);
      }
      fetchedSinceLastDelay++;

      try {
        dims = await fetchIIIFDimensions(ark, page);
      } catch {
        dims = { width: 0, height: 0 };
      }

      if (DRY_RUN) {
        console.log(`[dry-run] Would upload ${r2Key} to R2`);
      } else {
        try {
          await putR2Object(r2Key, imageBuffer, "image/jpeg");
        } catch (err) {
          logStructuredError({ day, page, stage: "r2-upload" }, err);
          process.exit(1);
        }
      }
    }

    const iiifRegion =
      dims.width > 0
        ? pixelRegion({ x: 0, y: 0, w: dims.width, h: dims.height })
        : null;

    if (!mediaAssetId) {
      try {
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
          DRY_RUN,
        );
      } catch (err) {
        logStructuredError({ day, page, stage: "media-assets-insert" }, err);
        process.exit(1);
      }
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

    try {
      await saveDayDoc(supabase, day, doc, DRY_RUN);
    } catch (err) {
      logStructuredError({ day, page, stage: "save-doc" }, err);
      process.exit(1);
    }

    summary.push({
      page,
      r2Key,
      mediaAssetId,
      skipped: SKIP_EXISTING && alreadyInR2 ? true : undefined,
    });
    console.log(`[pull-scans] Page ${page} done → ${r2Key}`);
  }

  console.log(
    JSON.stringify({ day, ark, pageCount, pages: summary, dryRun: DRY_RUN }),
  );
}

main().catch((err) => {
  console.error("[pull-scans] Unexpected error:", err);
  process.exit(1);
});
