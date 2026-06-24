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
  translateAndSegment,
  type SegmentedTranslation,
  type SectionTranslation,
} from "../llm/translate";
import {
  resolveIssueArk,
  fetchTexteBrut,
  gallicaPermalink,
  texteBrutUrl,
  DEBATS_PERIODICAL_ARK,
} from "../gallica";
import { putR2Text, isR2Configured } from "../r2-server";
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
  "galignani",
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
      return seg.galignani;
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
  section: SectionKey,
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

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Run the full day translation pipeline for a given date.
 *
 * 1. Resolve the Gallica issue ARK and fetch texteBrut (Tier 3 baseline).
 * 2. Call translateAndSegment() to translate + segment the whole issue.
 * 3. For each fixed section:
 *    - No live item yet → create it (machine_claude, live).
 *    - Live item is machine_claude → snapshot + re-translate (update in place).
 *    - Live item is existing_published / public-domain → generate non-live
 *      challenger row only; never overwrite the published text.
 * 4. Save the updated day_content.doc.
 *
 * Failures are collected per-section (not thrown for the batch).
 */
export async function runDayTranslation(
  date: string,
  log: (msg: string) => void = () => {},
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

  // ------------------------------------------------------------------
  // 2. Resolve Gallica ARK + fetch texteBrut
  // ------------------------------------------------------------------
  log(`[pipeline] Resolving Gallica ARK for ${date}…`);
  const issueInfo = await resolveIssueArk(DEBATS_PERIODICAL_ARK, date);
  if (!issueInfo) {
    throw new Error(
      `[pipeline] No Gallica issue found for ${date}. Cannot fetch source text.`,
    );
  }
  const { ark } = issueInfo;
  log(`[pipeline] ARK: ${ark}`);

  log(`[pipeline] Fetching texteBrut…`);
  const frenchText = await fetchTexteBrut(ark);
  if (!frenchText || frenchText.trim().length < 200) {
    throw new Error(
      `[pipeline] texteBrut returned empty or suspiciously short text for ${ark}. ` +
        `Check Gallica availability.`,
    );
  }
  log(`[pipeline] Fetched ${frenchText.length} chars of French text.`);

  // ------------------------------------------------------------------
  // 3. Store the French intermediate on R2 (admin-only diff reference)
  // ------------------------------------------------------------------
  const frIntermediateKey = `${date}/fr-intermediate/gallica-textebrut.txt`;
  const sourceTextUrl = texteBrutUrl(ark);
  const gallicaUrl = gallicaPermalink(ark);

  if (isR2Configured()) {
    try {
      await putR2Text(frIntermediateKey, frenchText);
      log(`[pipeline] FR intermediate written to R2: ${frIntermediateKey}`);
    } catch (err) {
      log(
        `[pipeline] Warning: could not write FR intermediate to R2: ${(err as Error).message}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // 4. Translate + segment with Claude
  // ------------------------------------------------------------------
  log(`[pipeline] Sending to Claude for translation + segmentation…`);
  const { result: segmented, usage } = await translateAndSegment(
    frenchText,
    date,
  );
  summary.cost_usd_total += usage.cost_usd;
  log(
    `[pipeline] Translation complete in ${(usage.duration_ms / 1000).toFixed(1)}s. ` +
      `Cost: $${usage.cost_usd.toFixed(4)} (${usage.tokens_in}in / ${usage.tokens_out}out).`,
  );

  // Cost is incurred once for the whole-issue call; attribute it evenly across
  // the sections that actually produced content, so the per-version ledger sums
  // back to the run total rather than recording zeros.
  const producedSections = ALL_SECTIONS.filter((s) => {
    const r = pickSection(segmented, s);
    return r && r.text.trim().length > 0;
  });
  const perSectionCost =
    producedSections.length > 0 ? usage.cost_usd / producedSections.length : 0;

  // Each run writes immutable, version-unique R2 keys so prior translations are
  // preserved for side-by-side comparison. The live TextItem and each
  // translation_versions row point at their own key; re-running never overwrites
  // a previous version's text.
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");

  // ------------------------------------------------------------------
  // 5. Process each section
  // ------------------------------------------------------------------
  for (const section of ALL_SECTIONS) {
    const sectionResult = pickSection(segmented, section);

    if (!sectionResult || !sectionResult.text.trim()) {
      log(`[pipeline] ${section}: no content in this issue — skipping.`);
      summary.skipped++;
      continue;
    }

    try {
      // Determine the slot_key
      const existingItems = getSectionItems(doc, section);
      const existingItem = existingItems[0]; // one text block per section in this pipeline
      const slotKey = existingItem?.slot_key ?? `${section}-1`;

      // Write English text to an immutable, version-unique R2 key.
      const enKey = `${date}/en/${slotKey}/${runStamp}.txt`;
      if (isR2Configured()) {
        await putR2Text(enKey, sectionResult.text);
      }

      const isExistingPublished =
        existingItem &&
        (existingItem.translation_origin === "existing_published" ||
          existingItem.translation_origin === "staff_translation");

      if (isExistingPublished) {
        // ------------------------------------------------------------------
        // Existing published/public-domain: add challenger row only.
        // Never overwrite the live published text.
        // ------------------------------------------------------------------
        log(
          `[pipeline] ${section}: existing_published live item — adding challenger.`,
        );
        await insertVersionRow(supabase, {
          installment_date: date,
          section,
          slot_key: slotKey,
          text_r2_key: enKey,
          source: "Journal des Débats",
          original_date: date,
          gallica_url: gallicaUrl,
          license: "Public Domain",
          attribution: `Machine translation by ${usage.model}`,
          model_used: usage.model,
          source_text_url: sourceTextUrl,
          fr_intermediate_r2_key: frIntermediateKey,
          cost_usd: perSectionCost,
          low_confidence: sectionResult.low_confidence,
          admin_notes: sectionResult.admin_notes ?? null,
        });
        summary.challengers++;
        continue;
      }

      if (existingItem) {
        // ------------------------------------------------------------------
        // Existing machine_claude: re-translate in place.
        // Its current state is already a translation_versions row when it has a
        // translation_version_id (producers write a row on creation), so we only
        // snapshot legacy items that predate version tracking to avoid duplicates.
        // ------------------------------------------------------------------
        if (existingItem.translation_version_id) {
          log(
            `[pipeline] ${section}: re-translating machine_claude item (prior state already versioned).`,
          );
        } else {
          log(
            `[pipeline] ${section}: snapshotting legacy item + re-translating.`,
          );
          await snapshotToVersions(supabase, date, section, existingItem, log);
        }
      } else {
        log(`[pipeline] ${section}: creating new live item.`);
      }

      // Insert the new version row (single-writer)
      const versionId = await insertVersionRow(supabase, {
        installment_date: date,
        section,
        slot_key: slotKey,
        text_r2_key: enKey,
        source: "Journal des Débats",
        original_date: date,
        gallica_url: gallicaUrl,
        license: "Public Domain",
        attribution: `Machine translation by ${usage.model}`,
        model_used: usage.model,
        source_text_url: sourceTextUrl,
        fr_intermediate_r2_key: frIntermediateKey,
        cost_usd: perSectionCost,
        low_confidence: sectionResult.low_confidence,
        admin_notes: sectionResult.admin_notes ?? null,
      });

      // Build the updated TextItem
      const updatedItem: TextItem = {
        kind: "text",
        text_r2_key: enKey,
        source: "Journal des Débats",
        original_date: date,
        gallica_url: gallicaUrl,
        license: "Public Domain",
        attribution: `Machine translation by ${usage.model}`,
        contributor_id: existingItem?.contributor_id,
        slot_key: slotKey,
        translation_origin: "machine_claude",
        translation_model: usage.model,
        source_text_url: sourceTextUrl,
        fr_intermediate_r2_key: frIntermediateKey,
        low_confidence: sectionResult.low_confidence || undefined,
        admin_notes: sectionResult.admin_notes,
        translation_version_id: versionId,
      };

      // Update the doc
      doc = setSectionTextItems(doc, section, [updatedItem]);

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

  // ------------------------------------------------------------------
  // 6. Save updated doc
  // ------------------------------------------------------------------
  log(`[pipeline] Saving updated day_content.doc for ${date}…`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: saveErr } = await (supabase as any)
    .from("day_content")
    .upsert(
      { installment_date: date, doc },
      { onConflict: "installment_date" },
    );
  if (saveErr) {
    throw new Error(
      `[pipeline] Failed to save day_content for ${date}: ${saveErr.message}`,
    );
  }

  log(
    `[pipeline] Done. translated=${summary.translated} created=${summary.created} ` +
      `challengers=${summary.challengers} skipped=${summary.skipped} ` +
      `failed=${summary.failed.length} cost=$${summary.cost_usd_total.toFixed(4)}`,
  );
  return summary;
}
