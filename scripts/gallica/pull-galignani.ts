#!/usr/bin/env npx tsx
/**
 * scripts/gallica/pull-galignani.ts
 *
 * Independent ingest for *Galignani's Messenger* (English-language Paris daily)
 * on Gallica — NOT chained to the Journal des Débats pipeline. For one
 * installment date it pulls the *exact same day's* Galignani issue:
 *
 *   1. resolve — find the issue ARK for the date (Issues service, cached by year)
 *   2. scans   — download every page image (IIIF) → R2 → image items
 *   3. text    — Gallica ALTO OCR per page (already English; no translation) → R2
 *                → text items
 *
 * Everything is stored in doc.galignani (rendered by GalignaniTab). The script's
 * own items carry slot_key "galignani-{scan,text}-page-N" so re-runs replace
 * them idempotently without touching hand-curated items in the same section.
 *
 * Text uses ALTO (RequestDigitalElement) rather than texteBrut: ALTO is a
 * different request class that Cloudflare's bot protection does not block.
 *
 * Usage:
 *   npx tsx scripts/gallica/pull-galignani.ts --date=1844-08-28
 *   npx tsx scripts/gallica/pull-galignani.ts --date=1844-08-28 --skip-existing
 *   npx tsx scripts/gallica/pull-galignani.ts --date=1844-08-28 --dry-run
 */

import "dotenv/config";
import {
  resolveIssueArk,
  gallicaPermalink,
  fetchIIIFPage,
  fetchIssueAltoText,
  GALIGNANI_PERIODICAL_ARK,
} from "../../lib/gallica";
import { putR2Object, putR2Text, r2ObjectExists } from "../../lib/r2-server";
import {
  makeSupabaseClient,
  loadDayDoc,
  saveDayDoc,
  insertMediaAsset,
  parseCliDate,
  DRY_RUN,
  REFRESH_GALLICA_CACHE,
  logStructuredError,
  runCliMain,
  sleep,
  IIIF_FULL_DELAY_MS,
  ALTO_DELAY_MS,
  type GallicaStepOptions,
} from "./_shared";
import type { DocItem, ImageItem, TextItem } from "../../lib/types/content";

const LICENSE = "Public Domain";
const SOURCE_PAPER = "Galignani's Messenger";
const SOURCE_LABEL = "Gallica / Bibliothèque nationale de France";

const scanSlot = (page: number) => `galignani-scan-page-${page}`;
const textSlot = (page: number) => `galignani-text-page-${page}`;
const SLOT_PREFIX = "galignani-";

function scanR2Key(day: string, page: number): string {
  return `galignani/${day}/page-${page}.jpg`;
}

function textR2Key(day: string, page: number): string {
  return `galignani/${day}/page-${page}.txt`;
}

/** slot_key for an item, or undefined for variants without one (audio). */
function slotOf(item: DocItem): string | undefined {
  return item.kind === "audio" ? undefined : item.slot_key;
}

/** True when this item was created by a prior run of this script. */
function isIngested(item: DocItem): boolean {
  const slot = slotOf(item);
  return slot != null && slot.startsWith(SLOT_PREFIX);
}

export interface PullGalignaniResult {
  day: string;
  ark: string;
  pageCount: number;
  scans: number;
  textPages: number;
  dryRun: boolean;
  /** True when every scan + the text were cache hits — no Gallica content was fetched. */
  allCached: boolean;
  /**
   * False when Gallica has no issue for this exact date — e.g. a Sunday, which
   * Galignani's Messenger did not publish. This is a legitimate absence, not an
   * error: callers should record it as skipped rather than failed.
   */
  found: boolean;
}

export async function runPullGalignani(
  options: GallicaStepOptions,
): Promise<PullGalignaniResult> {
  const {
    day,
    dryRun = false,
    skipExisting = false,
    refreshGallicaCache = false,
  } = options;
  const supabase = makeSupabaseClient();

  const resolved = await resolveIssueArk(GALIGNANI_PERIODICAL_ARK, day, {
    refresh: refreshGallicaCache,
  });
  if (!resolved) {
    // No issue digitized for this exact date (typically a Sunday — Galignani's
    // Messenger did not publish). Honour the exact-day rule: skip, don't fail.
    console.log(
      `[pull-galignani] ${day}: no Galignani's Messenger issue on Gallica (likely not published this day) — skipping`,
    );
    return {
      day,
      ark: "",
      pageCount: 0,
      scans: 0,
      textPages: 0,
      dryRun,
      allCached: true,
      found: false,
    };
  }
  const { ark, pageCount } = resolved;
  const gallicaUrl = gallicaPermalink(ark);
  console.log(
    `[pull-galignani] ${day}: ARK ${ark} (${pageCount} page(s)) → ${gallicaUrl}`,
  );

  const doc = await loadDayDoc(supabase, day);
  const existing = doc.galignani ?? [];

  // Partition the section: keep hand-curated items, replace our own by slot_key.
  const preserved = existing.filter((i) => !isIngested(i));
  const priorBySlot = new Map<string, DocItem>();
  for (const item of existing) {
    const slot = slotOf(item);
    if (slot && isIngested(item)) priorBySlot.set(slot, item);
  }
  const priorTextItems = existing.filter(
    (i): i is TextItem => i.kind === "text" && isIngested(i),
  );

  // ── 1. Page scans (IIIF) ──
  const scanItems: ImageItem[] = [];
  let fetchedSinceDelay = 0;
  // Tracks whether any Gallica content (a scan or the ALTO text) was actually
  // fetched. When nothing was — every page was a cache hit — the batch runner
  // can skip its inter-date rate-limit pause.
  let gallicaFetched = false;

  for (let page = 1; page <= pageCount; page++) {
    const slot = scanSlot(page);
    const r2Key = scanR2Key(day, page);
    const pageUrl = `${gallicaUrl}/f${page}`;
    const prior = priorBySlot.get(slot);
    const priorImage = prior?.kind === "image" ? prior : undefined;

    const alreadyInR2 = dryRun ? false : await r2ObjectExists(r2Key);

    if (skipExisting && alreadyInR2 && priorImage?.media_asset_id) {
      console.log(
        `[pull-galignani] Skipping scan ${page}/${pageCount} (already in R2 and doc)`,
      );
      scanItems.push(priorImage);
      doc.galignani = [...preserved, ...scanItems, ...priorTextItems];
      await saveDayDoc(supabase, day, doc, dryRun);
      continue;
    }

    if (skipExisting && alreadyInR2) {
      console.log(
        `[pull-galignani] Scan ${page}/${pageCount} already in R2; repairing doc only`,
      );
    } else {
      if (fetchedSinceDelay > 0) {
        console.log(
          `[pull-galignani] Waiting ${IIIF_FULL_DELAY_MS / 1000}s before scan ${page}…`,
        );
        await sleep(IIIF_FULL_DELAY_MS);
      }
      console.log(`[pull-galignani] Fetching scan ${page}/${pageCount}…`);
      const buf = await fetchIIIFPage(ark, page);
      fetchedSinceDelay++;
      gallicaFetched = true;
      if (dryRun) {
        console.log(`[dry-run] Would upload ${r2Key} to R2`);
      } else {
        await putR2Object(r2Key, buf, "image/jpeg");
      }
    }

    let mediaAssetId = priorImage?.media_asset_id ?? "";
    if (!mediaAssetId) {
      mediaAssetId = await insertMediaAsset(
        supabase,
        {
          kind: "scan",
          title: `Galignani's Messenger — ${day} — page ${page}`,
          caption: `${SOURCE_PAPER}, ${day}, page ${page} of ${pageCount}`,
          source: SOURCE_LABEL,
          source_url: pageUrl,
          iiif_region: null,
          license: LICENSE,
          attribution: `${SOURCE_PAPER}, ${day} — Gallica / BnF`,
          r2_key: r2Key,
          download_blocked: false,
        },
        dryRun,
      );
    }

    scanItems.push({
      kind: "image",
      media_asset_id: mediaAssetId,
      caption: `${SOURCE_PAPER}, ${day} — page ${page} of ${pageCount}`,
      slot_key: slot,
    });

    // Persist after each page so a crash mid-run never orphans a media_asset.
    doc.galignani = [...preserved, ...scanItems, ...priorTextItems];
    await saveDayDoc(supabase, day, doc, dryRun);
    console.log(`[pull-galignani] Scan ${page} done → ${r2Key}`);
  }

  // ── 2. Page text (ALTO OCR, English — no translation) ──
  let textItems: TextItem[];
  if (skipExisting && priorTextItems.length > 0) {
    console.log(
      `[pull-galignani] Skipping ALTO (${priorTextItems.length} text page(s) already in doc)`,
    );
    textItems = priorTextItems;
  } else {
    gallicaFetched = true;
    console.log(`[pull-galignani] Fetching ALTO OCR for ${pageCount} page(s)…`);
    const altoPages = await fetchIssueAltoText(ark, pageCount, {
      log: (msg) => console.log(`[pull-galignani] ${msg}`),
      pageDelayMs: ALTO_DELAY_MS,
    });

    textItems = [];
    for (const p of altoPages) {
      if (!p.text.trim()) continue;
      const r2Key = textR2Key(day, p.page);
      if (dryRun) {
        console.log(`[dry-run] Would write ${r2Key} (${p.text.length} chars)`);
      } else {
        await putR2Text(r2Key, p.text);
      }
      textItems.push({
        kind: "text",
        text_r2_key: r2Key,
        source: SOURCE_PAPER,
        original_date: day,
        gallica_url: gallicaUrl,
        license: LICENSE,
        attribution: `${SOURCE_PAPER}, ${day} — Gallica / BnF`,
        slot_key: textSlot(p.page),
      });
    }

    if (textItems.length === 0) {
      console.warn(
        `[pull-galignani] No ALTO text for ${day} — Gallica may have no OCR ` +
          `for this issue. Scans are still ingested; consider vision OCR.`,
      );
    }
  }

  doc.galignani = [...preserved, ...scanItems, ...textItems];
  await saveDayDoc(supabase, day, doc, dryRun);

  return {
    day,
    ark,
    pageCount,
    scans: scanItems.length,
    textPages: textItems.length,
    dryRun,
    allCached: !gallicaFetched,
    found: true,
  };
}

const HELP = `pull-galignani — ingest Galignani's Messenger for an exact date

Writes: galignani/{date}/page-N.{jpg,txt} in R2 + image/text items in doc.galignani
Batch:  npx tsx scripts/gallica/galignani-all.ts

Pages already in R2 are skipped by default; pass --force to re-fetch and overwrite.

Usage:
  npx tsx scripts/gallica/pull-galignani.ts --date=YYYY-MM-DD [--force] [--dry-run]`;

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const day = parseCliDate();
  // Skip pages already in R2 by default; --force re-fetches and overwrites.
  const force = process.argv.includes("--force");
  console.error(`[pull-galignani] ${day}: ingesting Galignani's Messenger`);
  try {
    const summary = await runPullGalignani({
      day,
      dryRun: DRY_RUN,
      skipExisting: !force,
      refreshGallicaCache: REFRESH_GALLICA_CACHE,
    });
    console.log(JSON.stringify(summary));
    console.error(
      summary.found
        ? `[pull-galignani] Done. ${summary.scans} scan(s), ${summary.textPages} text page(s) for ${day}.`
        : `[pull-galignani] No Galignani issue for ${day} (likely not published) — nothing ingested.`,
    );
  } catch (err) {
    logStructuredError({ day, stage: "pull-galignani" }, err);
    process.exit(1);
  }
}

runCliMain(import.meta.url, main, "pull-galignani");
