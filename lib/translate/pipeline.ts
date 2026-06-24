/**
 * lib/translate/pipeline.ts
 *
 * Core translation pipeline logic. Used by:
 *  - scripts/translate/translate-day.ts (local async runner)
 *  - app/actions/admin.ts translateDay() server action
 *
 * Does NOT import from lib/supabase/server.ts (which imports next/headers) so
 * it is safe in both script and server-action contexts. Creates its own
 * Supabase service-role client via @supabase/supabase-js.
 *
 * Single-writer rule: only this module inserts machine_claude rows into
 * translation_versions. update-day-content.ts only selects + snapshots.
 * import-existing.ts writes existing_published rows (separate writer, separate origin).
 */

import { createClient } from "@supabase/supabase-js";
import {
  translateAndSegmentByPage,
  translatePaperPages,
  resolveTranslationModel,
  type SegmentedTranslation,
  type SectionTranslation,
} from "../llm/translate";
import {
  resolveIssueArk,
  gallicaPermalink,
  texteBrutUrl,
  parseArkFromGallicaUrl,
  DEBATS_PERIODICAL_ARK,
} from "../gallica";
import { putR2Text, isR2Configured } from "../r2-server";
import { fetchTexteBrutToR2, loadCachedFrench } from "./french-source";
import { parseDayDoc, type DayDoc, type TextItem } from "../types/content";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SectionKey =
  | "overview"
  | "chapter"
  | "debats.music"
  | "debats.theater"
  | "debats.art"
  | "debats.literature"
  | "art_exhibitions"
  | "science"
  | "galignani";

export const ALL_SECTIONS: SectionKey[] = [
  "overview",
  "chapter",
  "debats.music",
  "debats.theater",
  "debats.art",
  "debats.literature",
  "art_exhibitions",
  "science",
  // galignani is excluded: Galignani's Messenger is a separate English paper,
  // ingested on its own (import-existing / future Gallica fetch), not from Débats OCR.
];

export interface TranslationFailure {
  section: string;
  slot_key: string;
  stage: "fetch_source" | "translate" | "write";
  error: string;
}

export interface TranslationRunSummary {
  /** Sections with a new or updated machine_claude live translation. */
  translated: number;
  /** Non-live challenger version rows appended for existing_published sections. */
  challengers: number;
  /** New live TextItems created (section had no prior item). */
  created: number;
  /** Sections skipped (no content in source, section empty in this issue). */
  skipped: number;
  /** Per-section failures — collected, not thrown. */
  failed: TranslationFailure[];
  /** Aggregate cost across all API calls in this run. */
  cost_usd_total: number;
}

export interface RunDayTranslationOptions {
  /** Re-fetch Gallica texteBrut even when an R2 intermediate already exists. */
  forceFetch?: boolean;
  /** Override TRANSLATION_MODEL for this run (e.g. claude-sonnet-4-5). */
  model?: string;
}

// ---------------------------------------------------------------------------
// Supabase (service role; no next/headers import)
// ---------------------------------------------------------------------------

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the translation pipeline.",
    );
  }
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Doc accessors
// ---------------------------------------------------------------------------

function getSectionItems(doc: DayDoc, section: SectionKey): TextItem[] {
  switch (section) {
    case "overview":
      return (doc.overview ?? []).filter(
        (i): i is TextItem => i.kind === "text",
      );
    case "chapter":
      return (doc.chapter ?? []).filter(
        (i): i is TextItem => i.kind === "text",
      );
    case "debats.music":
      return (doc.debats?.music ?? []).filter(
        (i): i is TextItem => i.kind === "text",
      );
    case "debats.theater":
      return (doc.debats?.theater ?? []).filter(
        (i): i is TextItem => i.kind === "text",
      );
    case "debats.art":
      return (doc.debats?.art ?? []).filter(
        (i): i is TextItem => i.kind === "text",
      );
    case "debats.literature":
      return (doc.debats?.literature ?? []).filter(
        (i): i is TextItem => i.kind === "text",
      );
    case "art_exhibitions":
      return (doc.art_exhibitions ?? []).filter(
        (i): i is TextItem => i.kind === "text",
      );
    case "science":
      return (doc.science ?? []).filter(
        (i): i is TextItem => i.kind === "text",
      );
    case "galignani":
      return (doc.galignani ?? []).filter(
        (i): i is TextItem => i.kind === "text",
      );
  }
}

function setSectionTextItems(
  doc: DayDoc,
  section: SectionKey,
  items: TextItem[],
): DayDoc {
  const updated = { ...doc };
  switch (section) {
    case "overview":
      updated.overview = [
        ...(doc.overview ?? []).filter((i) => i.kind !== "text"),
        ...items,
      ];
      break;
    case "chapter":
      updated.chapter = [
        ...(doc.chapter ?? []).filter((i) => i.kind !== "text"),
        ...items,
      ];
      break;
    case "debats.music":
      updated.debats = {
        ...(doc.debats ?? { music: [], theater: [], art: [], literature: [] }),
        music: [
          ...(doc.debats?.music ?? []).filter((i) => i.kind !== "text"),
          ...items,
        ],
      };
      break;
    case "debats.theater":
      updated.debats = {
        ...(doc.debats ?? { music: [], theater: [], art: [], literature: [] }),
        theater: [
          ...(doc.debats?.theater ?? []).filter((i) => i.kind !== "text"),
          ...items,
        ],
      };
      break;
    case "debats.art":
      updated.debats = {
        ...(doc.debats ?? { music: [], theater: [], art: [], literature: [] }),
        art: [
          ...(doc.debats?.art ?? []).filter((i) => i.kind !== "text"),
          ...items,
        ],
      };
      break;
    case "debats.literature":
      updated.debats = {
        ...(doc.debats ?? { music: [], theater: [], art: [], literature: [] }),
        literature: [
          ...(doc.debats?.literature ?? []).filter((i) => i.kind !== "text"),
          ...items,
        ],
      };
      break;
    case "art_exhibitions":
      updated.art_exhibitions = [
        ...(doc.art_exhibitions ?? []).filter((i) => i.kind !== "text"),
        ...items,
      ];
      break;
    case "science":
      updated.science = [
        ...(doc.science ?? []).filter((i) => i.kind !== "text"),
        ...items,
      ];
      break;
    case "galignani":
      updated.galignani = [
        ...(doc.galignani ?? []).filter((i) => i.kind !== "text"),
        ...items,
      ];
      break;
  }
  return updated;
}

/** Extract the section translation from a SegmentedTranslation by section key. */
function pickSection(
  seg: SegmentedTranslation,
  section: SectionKey,
): SectionTranslation | null {
  switch (section) {
    case "overview":
      return seg.overview;
    case "chapter":
      return seg.chapter;
    case "debats.music":
      return seg.debats?.music ?? null;
    case "debats.theater":
      return seg.debats?.theater ?? null;
    case "debats.art":
      return seg.debats?.art ?? null;
    case "debats.literature":
      return seg.debats?.literature ?? null;
    case "art_exhibitions":
      return seg.art_exhibitions;
    case "science":
      return seg.science;
    case "galignani":
      return null;
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Snapshot the current live TextItem into translation_versions (before overwriting). */
async function snapshotToVersions(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof makeClient>,
  date: string,
  section: SectionKey | "translated_pages",
  item: TextItem,
  log: (msg: string) => void,
): Promise<void> {
  if (!item.slot_key) {
    log(`[pipeline] No slot_key on item in ${section}; skipping snapshot.`);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("translation_versions")
    .insert({
      installment_date: date,
      section,
      slot_key: item.slot_key,
      text_r2_key: item.text_r2_key,
      source: item.source,
      original_date: item.original_date,
      gallica_url: item.gallica_url,
      license: item.license,
      attribution: item.attribution,
      contributor_id: item.contributor_id ?? null,
      translation_origin: item.translation_origin ?? "machine_claude",
      model_used: item.translation_model ?? null,
      translator: item.translator ?? null,
      translation_source_url: item.translation_source_url ?? null,
      source_text_url: item.source_text_url ?? null,
      fr_intermediate_r2_key: item.fr_intermediate_r2_key ?? null,
      cost_usd: null,
      low_confidence: item.low_confidence ?? false,
      admin_notes: item.admin_notes ?? null,
    });
  if (error) {
    log(
      `[pipeline] Warning: failed to snapshot ${section}/${item.slot_key}: ${error.message}`,
    );
  }
}

/** Insert a new machine_claude translation_versions row (single-writer). */
async function insertVersionRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof makeClient>,
  row: {
    installment_date: string;
    section: string;
    slot_key: string;
    text_r2_key: string;
    source: string;
    original_date: string | null;
    gallica_url: string;
    license: string;
    attribution: string;
    model_used: string;
    source_text_url: string;
    fr_intermediate_r2_key: string;
    cost_usd: number;
    low_confidence: boolean;
    admin_notes: string | null;
  },
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("translation_versions")
    .insert({
      ...row,
      translation_origin: "machine_claude",
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Error(
      `Failed to insert translation_versions row: ${error?.message ?? "no data"}`,
    );
  }
  return data.id as string;
}

async function persistDayDoc(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: ReturnType<typeof makeClient>,
  date: string,
  doc: DayDoc,
  log: (msg: string) => void,
): Promise<void> {
  parseDayDoc(doc);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("day_content")
    .upsert(
      { installment_date: date, doc },
      { onConflict: "installment_date" },
    );
  if (error) {
    throw new Error(
      `[pipeline] Failed to save day_content for ${date}: ${error.message}`,
    );
  }
  log(`[pipeline] Saved day_content.doc for ${date}.`);
}

/** Derive issue ARK from day_content without calling the Gallica Issues API. */
function arkFromDoc(doc: DayDoc): { ark: string; gallicaUrl: string } | null {
  if (doc.gallica_issue_url) {
    const ark = parseArkFromGallicaUrl(doc.gallica_issue_url);
    if (ark) {
      return { ark, gallicaUrl: doc.gallica_issue_url };
    }
  }

  for (const section of ALL_SECTIONS) {
    for (const item of getSectionItems(doc, section)) {
      if (item.gallica_url) {
        const ark = parseArkFromGallicaUrl(item.gallica_url);
        if (ark) {
          return { ark, gallicaUrl: item.gallica_url };
        }
      }
      if (item.source_text_url) {
        const ark = parseArkFromGallicaUrl(item.source_text_url);
        if (ark) {
          return { ark, gallicaUrl: gallicaPermalink(ark) };
        }
      }
    }
  }

  return null;
}

async function resolveSourceIssue(
  date: string,
  doc: DayDoc,
  log: (msg: string) => void,
): Promise<{ ark: string; gallicaUrl: string }> {
  const fromDoc = arkFromDoc(doc);
  if (fromDoc) {
    log(
      `[pipeline] Using ARK from day_content (no Issues API): ${fromDoc.ark}`,
    );
    return fromDoc;
  }

  log(`[pipeline] Resolving Gallica ARK for ${date}…`);
  const issueInfo = await resolveIssueArk(DEBATS_PERIODICAL_ARK, date);
  if (!issueInfo) {
    throw new Error(
      `[pipeline] No Gallica issue found for ${date}. Cannot fetch source text.`,
    );
  }
  log(`[pipeline] ARK: ${issueInfo.ark}`);
  return {
    ark: issueInfo.ark,
    gallicaUrl: gallicaPermalink(issueInfo.ark),
  };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full day translation pipeline for a given date.
 *
 * Incremental writes (safe to stop mid-run; completed steps are persisted):
 *  1. Load FR OCR from R2 when present (skip Gallica texteBrut unless forceFetch).
 *  2. Resolve issue ARK from day_content when possible (skip Issues API).
 *  3. Translate full paper page by page → day_content.translated_pages (saved first).
 *  4. Translate + segment each French page → merge sections → day_content per tab.
 *  5. Per section: EN text to R2 → translation_versions row → day_content.doc
 *     (live machine_claude updates only; challengers skip day_content).
 *
 * Failures are collected per-section (not thrown for the batch).
 */
export async function runDayTranslation(
  date: string,
  log: (msg: string) => void = () => {},
  options: RunDayTranslationOptions = {},
): Promise<TranslationRunSummary> {
  const supabase = makeClient();
  const summary: TranslationRunSummary = {
    translated: 0,
    challengers: 0,
    created: 0,
    skipped: 0,
    failed: [],
    cost_usd_total: 0,
  };

  // ------------------------------------------------------------------
  // 1. Load existing day doc
  // ------------------------------------------------------------------
  log(`[pipeline] Loading doc for ${date}…`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawRow, error: rowErr } = await (supabase as any)
    .from("day_content")
    .select("doc")
    .eq("installment_date", date)
    .single();

  let doc: DayDoc;
  if (rowErr && rowErr.code !== "PGRST116") {
    throw new Error(`day_content read failed for ${date}: ${rowErr.message}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc = parseDayDoc((rawRow as any)?.doc ?? {});

  const forceFetch = options.forceFetch === true;
  const model = resolveTranslationModel(options.model);
  log(`[pipeline] Translation model: ${model}`);

  // ------------------------------------------------------------------
  // 2. French source: reuse the R2 intermediate if present, else fetch
  //    Gallica texteBrut once. Other sources (ALTO, vision) are produced by
  //    their own scripts beforehand and picked up here from the cache.
  // ------------------------------------------------------------------
  const { ark, gallicaUrl } = await resolveSourceIssue(date, doc, log);

  const cached = forceFetch ? null : await loadCachedFrench(date, ark, log);
  const frenchSource = cached ?? (await fetchTexteBrutToR2({ date, ark, log }));

  const {
    frenchText,
    r2Key: frIntermediateKeyUsed,
    sourceTextUrl,
    lowConfidence: frenchSourceLowConfidence,
  } = frenchSource;

  summary.cost_usd_total += frenchSource.cost_usd;
  log(
    `[pipeline] French source: ${frenchSource.sourceLabel} ` +
      `(${frenchText.length} chars, tier ${frenchSource.sourceTier}` +
      `${frenchSourceLowConfidence ? ", low confidence" : ""}).`,
  );

  if (!isR2Configured()) {
    throw new Error(
      "[pipeline] R2 is not configured; cannot persist FR intermediate.",
    );
  }

  if (!doc.gallica_issue_url) {
    doc = { ...doc, gallica_issue_url: gallicaUrl };
    await persistDayDoc(supabase, date, doc, log);
  }

  // Each run writes immutable, version-unique R2 keys so prior translations are
  // preserved for side-by-side comparison.
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");

  // ------------------------------------------------------------------
  // 5. Full-paper page-by-page translation (run first — persist paid output)
  // ------------------------------------------------------------------
  log(`[pipeline] Translating full paper page by page…`);
  try {
    const { pages, totalUsage } = await translatePaperPages(frenchText, date, {
      log,
      model,
    });
    summary.cost_usd_total += totalUsage.cost_usd;
    log(
      `[pipeline] Page translations complete: ${pages.length} pages in ` +
        `${(totalUsage.duration_ms / 1000).toFixed(1)}s. ` +
        `Cost: $${totalUsage.cost_usd.toFixed(4)} (${totalUsage.tokens_in}in / ${totalUsage.tokens_out}out).`,
    );

    // Attribute the run cost evenly across the pages translated.
    const perPageCost =
      pages.length > 0 ? totalUsage.cost_usd / pages.length : 0;

    // Index existing page items by slot_key so re-runs version in place.
    const existingPages = new Map<string, TextItem>(
      (doc.translated_pages ?? [])
        .filter((i): i is TextItem => i.kind === "text" && Boolean(i.slot_key))
        .map((i) => [i.slot_key as string, i]),
    );

    const pageItems: TextItem[] = [];
    for (const { pageNumber, text } of pages) {
      const slotKey = `paper-page-${pageNumber}`;
      const pageKey = `${date}/en/${slotKey}/${runStamp}.txt`;
      await putR2Text(pageKey, text);
      log(`[pipeline] Page ${pageNumber}: EN text written to R2: ${pageKey}`);

      // Snapshot a legacy live page item (no version id) before overwriting so
      // prior paid runs enter history. Items the pipeline produced already carry
      // translation_version_id, so their prior state is already a version row.
      const existingItem = existingPages.get(slotKey);
      if (existingItem && !existingItem.translation_version_id) {
        log(
          `[pipeline] ${slotKey}: snapshotting legacy page item before overwrite.`,
        );
        await snapshotToVersions(
          supabase,
          date,
          "translated_pages",
          existingItem,
          log,
        );
      }

      const versionId = await insertVersionRow(supabase, {
        installment_date: date,
        section: "translated_pages",
        slot_key: slotKey,
        text_r2_key: pageKey,
        source: "Journal des Débats",
        original_date: date,
        gallica_url: gallicaUrl,
        license: "Public Domain",
        attribution: `Machine translation by ${totalUsage.model}`,
        model_used: totalUsage.model,
        source_text_url: sourceTextUrl,
        fr_intermediate_r2_key: frIntermediateKeyUsed,
        cost_usd: perPageCost,
        low_confidence: frenchSourceLowConfidence,
        admin_notes: null,
      });

      pageItems.push({
        kind: "text",
        text_r2_key: pageKey,
        source: "Journal des Débats",
        original_date: date,
        gallica_url: gallicaUrl,
        license: "Public Domain",
        attribution: `Machine translation by ${totalUsage.model}`,
        slot_key: slotKey,
        translation_origin: "machine_claude",
        translation_model: totalUsage.model,
        source_text_url: sourceTextUrl,
        fr_intermediate_r2_key: frIntermediateKeyUsed,
        low_confidence: frenchSourceLowConfidence || undefined,
        translation_version_id: versionId,
      });
    }

    doc = { ...doc, translated_pages: pageItems };
    await persistDayDoc(supabase, date, doc, log);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[pipeline] ERROR during page-by-page translation: ${message}`);
    summary.failed.push({
      section: "translated_pages",
      slot_key: "paper-page",
      stage: "translate",
      error: message,
    });
  }

  // ------------------------------------------------------------------
  // 6. Translate + segment by page (Overview, Débats tabs, etc.)
  // ------------------------------------------------------------------
  let segmented: SegmentedTranslation | null = null;
  let segmentUsage: {
    model: string;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    duration_ms: number;
  } | null = null;

  try {
    log(
      `[pipeline] Sending to Claude for per-page translation + segmentation…`,
    );
    const segmentResult = await translateAndSegmentByPage(frenchText, date, {
      log,
      model,
    });
    segmented = segmentResult.result;
    segmentUsage = segmentResult.usage;
    summary.cost_usd_total += segmentResult.usage.cost_usd;
    log(
      `[pipeline] Segmentation complete: ${segmentResult.pageCount} page(s) in ` +
        `${(segmentResult.usage.duration_ms / 1000).toFixed(1)}s. ` +
        `Cost: $${segmentResult.usage.cost_usd.toFixed(4)} ` +
        `(${segmentResult.usage.tokens_in}in / ${segmentResult.usage.tokens_out}out).`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[pipeline] ERROR during segmentation: ${message}`);
    summary.failed.push({
      section: "segmentation",
      slot_key: "segmentation",
      stage: "translate",
      error: message,
    });
  }

  if (segmented && segmentUsage) {
    const producedSections = ALL_SECTIONS.filter((s) => {
      const r = pickSection(segmented!, s);
      return r && r.text.trim().length > 0;
    });
    const perSectionCost =
      producedSections.length > 0
        ? segmentUsage.cost_usd / producedSections.length
        : 0;

    for (const section of ALL_SECTIONS) {
      const sectionResult = pickSection(segmented, section);

      if (!sectionResult || !sectionResult.text.trim()) {
        log(`[pipeline] ${section}: no content in this issue — skipping.`);
        summary.skipped++;
        continue;
      }

      try {
        const existingItems = getSectionItems(doc, section);
        const existingItem = existingItems[0];
        const slotKey = existingItem?.slot_key ?? `${section}-1`;

        const enKey = `${date}/en/${slotKey}/${runStamp}.txt`;
        await putR2Text(enKey, sectionResult.text);
        log(`[pipeline] ${section}: EN text written to R2: ${enKey}`);

        const isExistingPublished =
          existingItem &&
          (existingItem.translation_origin === "existing_published" ||
            existingItem.translation_origin === "staff_translation");

        if (isExistingPublished) {
          log(
            `[pipeline] ${section}: existing_published live item — adding challenger.`,
          );
          const challengerId = await insertVersionRow(supabase, {
            installment_date: date,
            section,
            slot_key: slotKey,
            text_r2_key: enKey,
            source: "Journal des Débats",
            original_date: date,
            gallica_url: gallicaUrl,
            license: "Public Domain",
            attribution: `Machine translation by ${segmentUsage.model}`,
            model_used: segmentUsage.model,
            source_text_url: sourceTextUrl,
            fr_intermediate_r2_key: frIntermediateKeyUsed,
            cost_usd: perSectionCost,
            low_confidence:
              sectionResult.low_confidence || frenchSourceLowConfidence,
            admin_notes: sectionResult.admin_notes ?? null,
          });
          log(
            `[pipeline] ${section}: challenger translation_versions row ${challengerId}`,
          );
          summary.challengers++;
          continue;
        }

        if (existingItem) {
          if (existingItem.translation_version_id) {
            log(
              `[pipeline] ${section}: re-translating machine_claude item (prior state already versioned).`,
            );
          } else {
            log(
              `[pipeline] ${section}: snapshotting legacy item + re-translating.`,
            );
            await snapshotToVersions(
              supabase,
              date,
              section,
              existingItem,
              log,
            );
          }
        } else {
          log(`[pipeline] ${section}: creating new live item.`);
        }

        const versionId = await insertVersionRow(supabase, {
          installment_date: date,
          section,
          slot_key: slotKey,
          text_r2_key: enKey,
          source: "Journal des Débats",
          original_date: date,
          gallica_url: gallicaUrl,
          license: "Public Domain",
          attribution: `Machine translation by ${segmentUsage.model}`,
          model_used: segmentUsage.model,
          source_text_url: sourceTextUrl,
          fr_intermediate_r2_key: frIntermediateKeyUsed,
          cost_usd: perSectionCost,
          low_confidence:
            sectionResult.low_confidence || frenchSourceLowConfidence,
          admin_notes: sectionResult.admin_notes ?? null,
        });

        const updatedItem: TextItem = {
          kind: "text",
          text_r2_key: enKey,
          source: "Journal des Débats",
          original_date: date,
          gallica_url: gallicaUrl,
          license: "Public Domain",
          attribution: `Machine translation by ${segmentUsage.model}`,
          contributor_id: existingItem?.contributor_id,
          slot_key: slotKey,
          translation_origin: "machine_claude",
          translation_model: segmentUsage.model,
          source_text_url: sourceTextUrl,
          fr_intermediate_r2_key: frIntermediateKeyUsed,
          low_confidence:
            sectionResult.low_confidence ||
            frenchSourceLowConfidence ||
            undefined,
          admin_notes: sectionResult.admin_notes,
          translation_version_id: versionId,
        };

        doc = setSectionTextItems(doc, section, [updatedItem]);
        await persistDayDoc(supabase, date, doc, log);

        if (!existingItem) {
          summary.created++;
        } else {
          summary.translated++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`[pipeline] ERROR processing ${section}: ${message}`);
        summary.failed.push({
          section,
          slot_key: `${section}-1`,
          stage: "write",
          error: message,
        });
      }
    }
  }

  log(
    `[pipeline] Done. translated=${summary.translated} created=${summary.created} ` +
      `challengers=${summary.challengers} skipped=${summary.skipped} ` +
      `failed=${summary.failed.length} cost=$${summary.cost_usd_total.toFixed(4)}`,
  );
  return summary;
}
