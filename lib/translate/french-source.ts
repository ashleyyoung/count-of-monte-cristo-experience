/**
 * lib/translate/french-source.ts
 *
 * French source text for the translation pipeline. There is no fallback chain:
 * each source is a single-purpose function, chosen explicitly by the caller
 * (one per CLI script). All of them write a French intermediate to R2 under
 * {date}/fr-intermediate/ and return the same FrenchSourceResult shape.
 *
 *   - fetchTexteBrutToR2  → Gallica texteBrut (Tier 3); gallica-textebrut.txt
 *   - fetchAltoToR2       → Gallica ALTO per-page stitch (Tier 3); gallica-alto.txt
 *   - transcribeVisionToR2 → Claude vision OCR of R2 page scans (Tier 4); vision-issue.txt
 *
 * loadCachedFrench reads whichever intermediate already exists (precedence:
 * texteBrut → ALTO → vision) so a translate step can reuse prior work.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchTexteBrut,
  fetchAltoXml,
  parseAltoXml,
  texteBrutUrl,
  DEBATS_DEFAULT_PAGE_COUNT,
  type AltoTextBlock,
} from "../gallica";
import { transcribePageImage } from "../llm/translate";
import {
  getR2Object,
  getR2Text,
  putR2Text,
  isR2Configured,
  r2ObjectExists,
} from "../r2-server";
import type { DayDoc } from "../types/content";

// ---------------------------------------------------------------------------
// R2 keys
// ---------------------------------------------------------------------------

export function texteBrutR2Key(date: string): string {
  return `${date}/fr-intermediate/gallica-textebrut.txt`;
}

export function altoR2Key(date: string): string {
  return `${date}/fr-intermediate/gallica-alto.txt`;
}

export function visionIssueR2Key(date: string): string {
  return `${date}/fr-intermediate/vision-issue.txt`;
}

export function visionPageR2Key(date: string, pageIndex: number): string {
  return `${date}/fr-intermediate/vision-page${pageIndex}.txt`;
}

/** Predictable R2 key written by pull-scans.ts. */
export function pageScanR2Key(date: string, pageNumber: number): string {
  return `gallica/${date}/page-${pageNumber}.jpg`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrenchSourceResult {
  frenchText: string;
  r2Key: string;
  sourceTier: 3 | 4;
  sourceLabel: string;
  sourceTextUrl: string;
  lowConfidence: boolean;
  cost_usd: number;
}

const ALTO_PAGE_DELAY_MS = 1_200;
const MIN_CHARS = 200;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Best page count for a day, skipping 0/null. Note `0 ?? 4` is `0`, so a plain
 * `??` chain breaks when original_pages is an empty array; this guards that.
 */
export function effectivePageCount(doc: DayDoc, resolved?: number): number {
  for (const n of [
    resolved,
    doc.gallica_page_count,
    doc.original_pages?.length,
    DEBATS_DEFAULT_PAGE_COUNT,
  ]) {
    if (n != null && n > 0) return n;
  }
  return DEBATS_DEFAULT_PAGE_COUNT;
}

function altoBlocksToPlainText(blocks: AltoTextBlock[]): string {
  return [...blocks]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n");
}

function looksLikeHtml(text: string): boolean {
  const trimmed = text.trim();
  return /^\s*</.test(trimmed) && /<html|<!doctype/i.test(trimmed);
}

// ---------------------------------------------------------------------------
// Cache lookup (used by the translate step)
// ---------------------------------------------------------------------------

/**
 * Return the best French intermediate already in R2, or null. Precedence:
 * texteBrut → ALTO → vision. Skips empty, too-short, or HTML-bodied caches.
 */
export async function loadCachedFrench(
  date: string,
  ark: string,
  log: (msg: string) => void,
): Promise<FrenchSourceResult | null> {
  if (!isR2Configured()) return null;

  const candidates: Array<{
    key: string;
    tier: 3 | 4;
    label: string;
    lowConfidence: boolean;
  }> = [
    {
      key: texteBrutR2Key(date),
      tier: 3,
      label: "Gallica texteBrut (cached)",
      lowConfidence: false,
    },
    {
      key: altoR2Key(date),
      tier: 3,
      label: "Gallica ALTO (cached)",
      lowConfidence: false,
    },
    {
      key: visionIssueR2Key(date),
      tier: 4,
      label: "Vision OCR of page scans (cached)",
      lowConfidence: true,
    },
  ];

  for (const c of candidates) {
    if (!(await r2ObjectExists(c.key))) continue;
    const text = await getR2Text(c.key);
    if (!text || text.trim().length < MIN_CHARS) {
      log(`[french-source] Cached ${c.key} is empty or too short; skipping.`);
      continue;
    }
    if (c.tier === 3 && looksLikeHtml(text)) {
      log(`[french-source] Cached ${c.key} is HTML, not OCR; skipping.`);
      continue;
    }
    log(
      `[french-source] Using cached FR intermediate: ${c.key} (${text.length} chars).`,
    );
    return {
      frenchText: text,
      r2Key: c.key,
      sourceTier: c.tier,
      sourceLabel: c.label,
      sourceTextUrl: texteBrutUrl(ark),
      lowConfidence: c.lowConfidence,
      cost_usd: 0,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Source 1: Gallica texteBrut (Tier 3)
// ---------------------------------------------------------------------------

export interface TexteBrutOptions {
  date: string;
  ark: string;
  log: (msg: string) => void;
  /** When true, return R2 cached French intermediate if valid (no Gallica call). */
  skipIfCached?: boolean;
}

/** Fetch Gallica texteBrut, write it to R2, and return it. Throws on failure. */
export async function fetchTexteBrutToR2(
  options: TexteBrutOptions,
): Promise<FrenchSourceResult> {
  const { date, ark, log, skipIfCached = false } = options;

  if (skipIfCached) {
    const cached = await loadCachedFrench(date, ark, log);
    if (cached) return cached;
  }

  const sourceTextUrl = texteBrutUrl(ark);

  log(`[french-source] Fetching Gallica texteBrut…`);
  log(`[french-source] URL: ${sourceTextUrl}`);
  const frenchText = await fetchTexteBrut(ark, undefined, { log });

  if (!frenchText || frenchText.trim().length < MIN_CHARS) {
    throw new Error(
      `texteBrut returned too little text (${frenchText?.trim().length ?? 0} chars) for ${date}.`,
    );
  }

  const r2Key = texteBrutR2Key(date);
  if (isR2Configured()) {
    await putR2Text(r2Key, frenchText);
    log(`[french-source] Wrote ${r2Key} (${frenchText.length} chars).`);
  }

  return {
    frenchText,
    r2Key,
    sourceTier: 3,
    sourceLabel: "Gallica texteBrut",
    sourceTextUrl,
    lowConfidence: false,
    cost_usd: 0,
  };
}

// ---------------------------------------------------------------------------
// Source 2: Gallica ALTO per-page stitch (Tier 3)
// ---------------------------------------------------------------------------

export interface AltoOptions {
  date: string;
  ark: string;
  pageCount: number;
  log: (msg: string) => void;
  /**
   * Page-1 TextBlocks already fetched elsewhere (crop-strip derives the
   * feuilleton region from this same page moments earlier in ingest-day's
   * pipeline). When provided, skips the redundant network fetch for page 1.
   */
  page1Blocks?: AltoTextBlock[];
}

/** Fetch + stitch Gallica ALTO OCR for every page, write to R2. Throws if empty. */
export async function fetchAltoToR2(
  options: AltoOptions,
): Promise<FrenchSourceResult> {
  const { date, ark, pageCount, log, page1Blocks } = options;

  log(
    `[french-source] Fetching ALTO OCR (${pageCount} page(s)) — BnF structured OCR, separate endpoint from texteBrut…`,
  );
  const pageTexts: string[] = [];

  for (let page = 1; page <= pageCount; page++) {
    if (page > 1) {
      log(`[french-source] ALTO: waiting ${ALTO_PAGE_DELAY_MS / 1000}s…`);
      await new Promise((r) => setTimeout(r, ALTO_PAGE_DELAY_MS));
    }
    let blocks: AltoTextBlock[];
    if (page === 1 && page1Blocks) {
      log(`[french-source] ALTO page 1: reusing blocks from crop-strip (no refetch).`);
      blocks = page1Blocks;
    } else {
      log(`[french-source] ALTO: fetching page ${page}/${pageCount}…`);
      const xml = await fetchAltoXml(ark, page);
      blocks = parseAltoXml(xml);
    }
    if (blocks.length === 0) {
      log(`[french-source] ALTO page ${page}: no TextBlocks — skipping page.`);
      continue;
    }
    const pageText = altoBlocksToPlainText(blocks);
    pageTexts.push(`--- Page ${page} ---\n${pageText}`);
    log(
      `[french-source] ALTO page ${page}: ${blocks.length} blocks, ${pageText.length} chars.`,
    );
  }

  const combined = pageTexts.join("\n\n");
  if (combined.trim().length < MIN_CHARS) {
    throw new Error(
      `ALTO stitch produced too little text (${combined.trim().length} chars) for ${date}.`,
    );
  }

  const r2Key = altoR2Key(date);
  if (isR2Configured()) {
    await putR2Text(r2Key, combined);
    log(`[french-source] Wrote ${r2Key} (${combined.length} chars).`);
  }

  return {
    frenchText: combined,
    r2Key,
    sourceTier: 3,
    sourceLabel: "Gallica ALTO (per-page stitch)",
    sourceTextUrl: texteBrutUrl(ark),
    lowConfidence: false,
    cost_usd: 0,
  };
}

// ---------------------------------------------------------------------------
// Source 3: Claude vision OCR of R2 page scans (Tier 4)
// ---------------------------------------------------------------------------

export interface VisionOptions {
  date: string;
  doc: DayDoc;
  supabase: SupabaseClient;
  gallicaUrl: string;
  log: (msg: string) => void;
  forceFetch?: boolean;
}

async function resolvePageImageR2Key(
  supabase: SupabaseClient,
  date: string,
  pageIndex: number,
  doc: DayDoc,
  log: (msg: string) => void,
): Promise<string | null> {
  const pageItem = doc.original_pages?.[pageIndex];
  if (pageItem?.media_asset_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("media_assets")
      .select("r2_key")
      .eq("id", pageItem.media_asset_id)
      .single();
    if (!error && data?.r2_key) {
      return data.r2_key as string;
    }
    log(
      `[french-source] media_assets lookup failed for page ${pageIndex + 1}: ${error?.message ?? "no r2_key"}`,
    );
  }

  const fallback = pageScanR2Key(date, pageIndex + 1);
  if (await r2ObjectExists(fallback)) {
    log(`[french-source] Using fallback scan key: ${fallback}`);
    return fallback;
  }
  return null;
}

/**
 * Transcribe every R2 page scan with the vision model, write to R2. Throws if
 * no page scans exist (run pull-scans first) or the result is too short.
 */
export async function transcribeVisionToR2(
  options: VisionOptions,
): Promise<FrenchSourceResult> {
  const { date, doc, supabase, gallicaUrl, log, forceFetch = false } = options;
  const pages = doc.original_pages ?? [];
  if (pages.length === 0) {
    throw new Error(
      `No page scans in day_content.original_pages for ${date}. ` +
        `Run: npx tsx scripts/gallica/pull-scans.ts --date=${date}`,
    );
  }

  if (!isR2Configured()) {
    throw new Error("[french-source] R2 is not configured.");
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "[french-source] ANTHROPIC_API_KEY is required for vision OCR of page scans.",
    );
  }

  const issueKey = visionIssueR2Key(date);
  if (!forceFetch && (await r2ObjectExists(issueKey))) {
    const cached = await getR2Text(issueKey);
    if (cached && cached.trim().length >= MIN_CHARS) {
      log(
        `[french-source] Using cached vision-issue.txt (${cached.length} chars).`,
      );
      return {
        frenchText: cached,
        r2Key: issueKey,
        sourceTier: 4,
        sourceLabel: "Vision OCR of page scans (cached)",
        sourceTextUrl: gallicaUrl,
        lowConfidence: true,
        cost_usd: 0,
      };
    }
  }

  log(
    `[french-source] Vision OCR: transcribing ${pages.length} page scan(s) from R2…`,
  );

  const pageTexts: string[] = [];
  let totalCost = 0;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const pageKey = visionPageR2Key(date, pageIndex);
    let pageText: string | null = null;

    if (!forceFetch && (await r2ObjectExists(pageKey))) {
      pageText = await getR2Text(pageKey);
      if (pageText && pageText.trim().length > 0) {
        log(
          `[french-source] Page ${pageIndex + 1}: using cached vision-page${pageIndex}.txt (${pageText.length} chars).`,
        );
      } else {
        pageText = null;
      }
    }

    if (!pageText) {
      const imageR2Key = await resolvePageImageR2Key(
        supabase,
        date,
        pageIndex,
        doc,
        log,
      );
      if (!imageR2Key) {
        throw new Error(
          `[french-source] No R2 scan image for page ${pageIndex + 1}. ` +
            `Expected media_assets row or ${pageScanR2Key(date, pageIndex + 1)}.`,
        );
      }

      const buf = await getR2Object(imageR2Key);
      if (!buf) {
        throw new Error(`[french-source] R2 object missing: ${imageR2Key}`);
      }

      let mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";
      if (imageR2Key.endsWith(".png")) mediaType = "image/png";
      else if (imageR2Key.endsWith(".webp")) mediaType = "image/webp";

      log(
        `[french-source] Page ${pageIndex + 1}: vision transcribing ${imageR2Key} (${(buf.length / 1024).toFixed(0)} KB)…`,
      );

      const result = await transcribePageImage(
        buf.toString("base64"),
        mediaType,
        { date, page: pageIndex },
      );
      pageText = result.french_text;
      totalCost += result.cost_usd;

      await putR2Text(pageKey, pageText);
      log(
        `[french-source] Page ${pageIndex + 1}: ${pageText.length} chars, ` +
          `cost=$${result.cost_usd.toFixed(4)} → ${pageKey}`,
      );
    }

    pageTexts.push(`--- Page ${pageIndex + 1} ---\n${pageText}`);
  }

  const combined = pageTexts.join("\n\n");
  if (combined.trim().length < MIN_CHARS) {
    throw new Error(
      `[french-source] Vision OCR produced insufficient text (${combined.length} chars).`,
    );
  }

  await putR2Text(issueKey, combined);
  log(
    `[french-source] Vision issue transcript: ${combined.length} chars, ` +
      `total vision cost=$${totalCost.toFixed(4)} → ${issueKey}`,
  );

  return {
    frenchText: combined,
    r2Key: issueKey,
    sourceTier: 4,
    sourceLabel: "Vision OCR of R2 page scans",
    sourceTextUrl: gallicaUrl,
    lowConfidence: true,
    cost_usd: totalCost,
  };
}
