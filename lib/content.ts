/**
 * lib/content.ts
 *
 * Server-side data fetcher for /day/[date] pages.
 *
 * Queries `day_page_view` for the installment document and its linked assets,
 * then:
 *  1. Batch-resolves all media_asset_id references in the doc with a single
 *     Supabase `IN` query on `media_assets`.
 *  2. Fetches all `*_r2_key` text objects from R2 in parallel.
 *
 * No fallback / precedence logic — each field has exactly one representation.
 * If a field is missing it is absent from the returned data.
 */

import { createClient } from "@/lib/supabase/server";
import { getR2Text } from "@/lib/r2-server";
import { resolveMediaUrl, type MediaAsset } from "@/lib/media";
import type {
  DayDoc,
  DocItem,
  ImageItem,
  PageSection,
} from "@/lib/types/content";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkedAsset {
  id: string;
  kind: string;
  title: string | null;
  r2_key: string | null;
  source_url: string | null;
  license: string | null;
  attribution: string | null;
  tab: string | null;
  section: string | null;
  sort_order: number;
}

export interface ResolvedTextItem {
  kind: "text";
  text: string;
  source: string;
  original_date: string;
  gallica_url: string;
  license: string;
  attribution: string;
  contributor_id?: string;
  // Translation provenance (Sprint 9) -----------------------------------------
  /** Stable identity key for translation history lookup. */
  slot_key?: string;
  /** "machine_claude" | "existing_published" | "staff_translation" */
  translation_origin?: string;
  /** Human translator credit for existing_published items (shown via <Cite>). */
  translator?: string;
  /** URL where an existing translation was sourced (shown via <Cite>). */
  translation_source_url?: string;
  /** Public permalink to the untranslated French source (shown via <Cite>). */
  source_text_url?: string;
  // Admin-only fields — never passed to public rendering ----------------------
  /** Exact model id (admin-only). */
  translation_model?: string;
  /** R2 key for the FR intermediate text (admin diff panel). */
  fr_intermediate_r2_key?: string;
  /** Admin notes about quality / flagged passages. */
  admin_notes?: string;
  /** When true, model flagged low confidence or poor OCR source. */
  low_confidence?: boolean;
  /** FK-by-value to the current translation_versions row. */
  translation_version_id?: string;
  /**
   * Reading-order sections with source-image regions and character spans into
   * `text`. Present on section-aware per-page translations; enables
   * hover-to-highlight against the page scan.
   */
  sections?: PageSection[];
}

export interface ResolvedImageItem {
  kind: "image";
  url: string;
  caption: string;
  contributor_id?: string;
}

export interface ResolvedAudioItem {
  kind: "audio";
  url: string;
  work_title: string;
  composer: string;
  audio_license: string;
  contributor_id?: string;
}

export type ResolvedDocItem =
  | ResolvedTextItem
  | ResolvedImageItem
  | ResolvedAudioItem;

export interface ResolvedDebats {
  music: ResolvedDocItem[];
  theater: ResolvedDocItem[];
  art: ResolvedDocItem[];
  literature: ResolvedDocItem[];
}

export interface DayPageData {
  installment_date: string;
  doc: DayDoc;
  linked_assets: LinkedAsset[];
  /** Resolved items ready for rendering, keyed by section. */
  resolved: {
    feuilleton_strip: ResolvedImageItem | null;
    original_pages: ResolvedImageItem[];
    overview: ResolvedDocItem[];
    news: ResolvedDocItem[];
    society: ResolvedDocItem[];
    scandals: ResolvedDocItem[];
    chapter: ResolvedDocItem[];
    debats: ResolvedDebats;
    art_exhibitions: ResolvedDocItem[];
    science: ResolvedDocItem[];
    galignani: ResolvedDocItem[];
    /** Per-page verbatim translations (page 1, 2, …) for the "Translated paper" tab. */
    translated_pages: ResolvedDocItem[];
  };
}

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

/**
 * Fetches and resolves all content for a given installment date.
 * Returns null if the date does not exist in day_page_view.
 */
export async function getDayPageData(
  date: string,
): Promise<DayPageData | null> {
  const supabase = await createClient();

  // 1. Fetch the view row.
  type DayViewRow = {
    installment_date: string;
    doc: DayDoc;
    linked_assets: LinkedAsset[];
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawRow, error } = await (supabase as any)
    .from("day_page_view")
    .select("installment_date, doc, linked_assets")
    .eq("installment_date", date)
    .single();

  if (error || !rawRow) {
    if (error?.code !== "PGRST116") {
      console.error("[content] day_page_view fetch:", error?.message);
    }
    return null;
  }

  const row = rawRow as DayViewRow;

  const doc = row.doc as DayDoc;
  const linkedAssets = (row.linked_assets ?? []) as LinkedAsset[];

  // 2. Collect every media_asset_id referenced anywhere in the doc.
  const assetIds = collectAssetIds(doc);

  // 3. Batch-fetch media_assets for those ids.
  const assetMap = await fetchMediaAssets(supabase, assetIds);

  // 4. Collect every text R2 key referenced in the doc.
  const textKeys = collectTextKeys(doc);

  // 5. Fetch all text objects from R2 in parallel.
  const textMap = await fetchTexts(textKeys);

  // 6. Resolve the doc into rendering-ready structures.
  const resolved = await resolveDoc(doc, assetMap, textMap);

  return {
    installment_date: row.installment_date as string,
    doc,
    linked_assets: linkedAssets,
    resolved,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectAssetIds(doc: DayDoc): string[] {
  const ids = new Set<string>();

  if (doc.feuilleton_strip) ids.add(doc.feuilleton_strip.media_asset_id);

  for (const p of doc.original_pages ?? []) {
    ids.add(p.media_asset_id);
  }

  for (const section of [
    doc.overview,
    doc.news,
    doc.society,
    doc.scandals,
    doc.chapter,
    doc.art_exhibitions,
    doc.science,
    doc.galignani,
    doc.debats?.music,
    doc.debats?.theater,
    doc.debats?.art,
    doc.debats?.literature,
  ] as DocItem[][]) {
    for (const item of section ?? []) {
      if (item.kind === "image" || item.kind === "audio") {
        ids.add(item.media_asset_id);
      }
    }
  }

  return [...ids];
}

function collectTextKeys(doc: DayDoc): string[] {
  const keys = new Set<string>();

  for (const section of [
    doc.overview,
    doc.news,
    doc.society,
    doc.scandals,
    doc.chapter,
    doc.art_exhibitions,
    doc.science,
    doc.galignani,
    doc.debats?.music,
    doc.debats?.theater,
    doc.debats?.art,
    doc.debats?.literature,
    doc.translated_pages,
  ] as DocItem[][]) {
    for (const item of section ?? []) {
      if (item.kind === "text") {
        keys.add(item.text_r2_key);
      }
    }
  }

  return [...keys];
}

async function fetchMediaAssets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ids: string[],
): Promise<Map<string, MediaAsset & { display_url: string }>> {
  const map = new Map<string, MediaAsset & { display_url: string }>();
  if (ids.length === 0) return map;

  type AssetRow = {
    id: string;
    r2_key: string | null;
    source_url: string | null;
    download_blocked: boolean;
    download_blocked_reason: string | null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = (await (supabase as any)
    .from("media_assets")
    .select("id, r2_key, source_url, download_blocked, download_blocked_reason")
    .in("id", ids)) as {
    data: AssetRow[] | null;
    error: { message: string } | null;
  };

  if (error) {
    console.error("[content] fetchMediaAssets:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    try {
      const display_url = resolveMediaUrl(row as MediaAsset);
      map.set(row.id, { ...(row as MediaAsset), display_url });
    } catch (err) {
      console.error(err);
    }
  }

  return map;
}

async function fetchTexts(keys: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (keys.length === 0) return map;

  const results = await Promise.allSettled(
    keys.map(async (key) => {
      const text = await getR2Text(key);
      return { key, text };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.text !== null) {
      map.set(result.value.key, result.value.text);
    } else if (result.status === "rejected") {
      console.error("[content] fetchTexts:", result.reason);
    }
  }

  return map;
}

function resolveItem(
  item: DocItem,
  assetMap: Map<string, MediaAsset & { display_url: string }>,
  textMap: Map<string, string>,
): ResolvedDocItem | null {
  if (item.kind === "text") {
    const text = textMap.get(item.text_r2_key);
    if (!text) {
      console.warn("[content] Missing R2 text:", item.text_r2_key);
      return null;
    }
    return {
      kind: "text",
      text,
      source: item.source,
      original_date: item.original_date,
      gallica_url: item.gallica_url,
      license: item.license,
      attribution: item.attribution,
      contributor_id: item.contributor_id,
      // Translation provenance fields (Sprint 9)
      slot_key: item.slot_key,
      translation_origin: item.translation_origin,
      translator: item.translator,
      translation_source_url: item.translation_source_url,
      source_text_url: item.source_text_url,
      translation_model: item.translation_model,
      fr_intermediate_r2_key: item.fr_intermediate_r2_key,
      admin_notes: item.admin_notes,
      low_confidence: item.low_confidence,
      translation_version_id: item.translation_version_id,
      sections: item.sections,
    };
  }

  if (item.kind === "image") {
    const asset = assetMap.get(item.media_asset_id);
    if (!asset) {
      console.warn("[content] Missing asset:", item.media_asset_id);
      return null;
    }
    return {
      kind: "image",
      url: asset.display_url,
      caption: item.caption,
      contributor_id: item.contributor_id,
    };
  }

  if (item.kind === "audio") {
    const asset = assetMap.get(item.media_asset_id);
    if (!asset) {
      console.warn("[content] Missing asset:", item.media_asset_id);
      return null;
    }
    return {
      kind: "audio",
      url: asset.display_url,
      work_title: item.work_title,
      composer: item.composer,
      audio_license: item.audio_license,
      contributor_id: item.contributor_id,
    };
  }

  return null;
}

function resolveSection(
  items: DocItem[],
  assetMap: Map<string, MediaAsset & { display_url: string }>,
  textMap: Map<string, string>,
): ResolvedDocItem[] {
  return (items ?? [])
    .map((item) => resolveItem(item, assetMap, textMap))
    .filter((item): item is ResolvedDocItem => item !== null);
}

function resolveImageItem(
  item: ImageItem | null,
  assetMap: Map<string, MediaAsset & { display_url: string }>,
): ResolvedImageItem | null {
  if (!item) return null;
  const asset = assetMap.get(item.media_asset_id);
  if (!asset) {
    console.warn(
      "[content] Missing feuilleton/page asset:",
      item.media_asset_id,
    );
    return null;
  }
  return { kind: "image", url: asset.display_url, caption: item.caption };
}

async function resolveDoc(
  doc: DayDoc,
  assetMap: Map<string, MediaAsset & { display_url: string }>,
  textMap: Map<string, string>,
): Promise<DayPageData["resolved"]> {
  return {
    feuilleton_strip: resolveImageItem(doc.feuilleton_strip ?? null, assetMap),
    original_pages: (doc.original_pages ?? [])
      .map((p) => resolveImageItem(p, assetMap))
      .filter((p): p is ResolvedImageItem => p !== null),
    overview: resolveSection(doc.overview ?? [], assetMap, textMap),
    news: resolveSection(doc.news ?? [], assetMap, textMap),
    society: resolveSection(doc.society ?? [], assetMap, textMap),
    scandals: resolveSection(doc.scandals ?? [], assetMap, textMap),
    chapter: resolveSection(doc.chapter ?? [], assetMap, textMap),
    debats: {
      music: resolveSection(doc.debats?.music ?? [], assetMap, textMap),
      theater: resolveSection(doc.debats?.theater ?? [], assetMap, textMap),
      art: resolveSection(doc.debats?.art ?? [], assetMap, textMap),
      literature: resolveSection(
        doc.debats?.literature ?? [],
        assetMap,
        textMap,
      ),
    },
    art_exhibitions: resolveSection(
      doc.art_exhibitions ?? [],
      assetMap,
      textMap,
    ),
    science: resolveSection(doc.science ?? [], assetMap, textMap),
    galignani: resolveSection(doc.galignani ?? [], assetMap, textMap),
    translated_pages: resolveSection(
      doc.translated_pages ?? [],
      assetMap,
      textMap,
    ),
  };
}
