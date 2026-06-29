/**
 * lib/summarize/pipeline.ts
 *
 * Summarize live translated_pages into doc.overview (Highlights on the Overview tab).
 * Used by scripts/summarize/summarize-day.ts and app/actions/admin.ts summarizeDay().
 */

import { getByDate } from "../installments";
import {
  summarizeTranslatedPages,
  type SummarizeInstallmentContext,
} from "../llm/summarize";
import { resolveTranslationModel } from "../llm/translate";
import { getR2Text, putR2Text, isR2Configured } from "../r2-server";
import { parseDayDoc, type DayDoc, type TextItem } from "../types/content";
import {
  insertVersionRow,
  makeClient,
  persistDayDoc,
  setSectionTextItems,
  snapshotToVersions,
} from "../translate/pipeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummarizeRunSummary {
  updated: boolean;
  skipped: boolean;
  cost_usd_total: number;
  model: string;
  skip_reason?: string;
}

export interface RunDaySummarizationOptions {
  /** Override TRANSLATION_MODEL for this run (default: claude-sonnet-4-6). */
  model?: string;
}

const OVERVIEW_SLOT_KEY = "overview-1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pageNumberFromSlotKey(slotKey: string): number | null {
  const match = /^paper-page-(\d+)$/.exec(slotKey);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function buildChapterLabel(
  chapters: { num: string; title: string; cont: boolean }[],
): string {
  if (chapters.length === 0) return "Chapter";
  const first = chapters[0];
  const title = first.title.trim();
  if (chapters.length === 1) {
    return first.cont
      ? `Chapter ${first.num} (continued)`
      : `Chapter ${first.num}: ${title}`;
  }
  const nums = chapters.map((c) => c.num).join(", ");
  return `Chapters ${nums}`;
}

function buildInstallmentContext(date: string): SummarizeInstallmentContext {
  const installment = getByDate(date);
  if (!installment) {
    return {
      label: date,
      part: 1,
      part_index: 0,
      chapterLabel: "The Count of Monte-Cristo",
    };
  }
  return {
    label: installment.label,
    part: installment.part,
    part_index: installment.part_index,
    chapterLabel: buildChapterLabel(installment.chapters),
  };
}

function getOverviewTextItem(doc: DayDoc): TextItem | undefined {
  return (doc.overview ?? []).find(
    (i): i is TextItem => i.kind === "text" && i.slot_key === OVERVIEW_SLOT_KEY,
  );
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

/**
 * Read live translated_pages from R2, summarize with Claude, write doc.overview.
 */
export async function runDaySummarization(
  date: string,
  log: (msg: string) => void = () => {},
  options: RunDaySummarizationOptions = {},
): Promise<SummarizeRunSummary> {
  const model = resolveTranslationModel(options.model);
  const emptySummary = (
    skipped: boolean,
    skip_reason?: string,
  ): SummarizeRunSummary => ({
    updated: false,
    skipped,
    cost_usd_total: 0,
    model,
    skip_reason,
  });

  if (!isR2Configured()) {
    throw new Error(
      "[summarize] R2 is not configured; cannot read translated pages or write overview.",
    );
  }

  const supabase = makeClient();
  log(`[summarize] Loading doc for ${date}…`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawRow, error: rowErr } = await (supabase as any)
    .from("day_content")
    .select("doc")
    .eq("installment_date", date)
    .single();

  if (rowErr && rowErr.code !== "PGRST116") {
    throw new Error(`day_content read failed for ${date}: ${rowErr.message}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc = parseDayDoc((rawRow as any)?.doc ?? {});

  const translatedPageItems = (doc.translated_pages ?? []).filter(
    (i): i is TextItem => i.kind === "text" && Boolean(i.text_r2_key),
  );

  if (translatedPageItems.length === 0) {
    log(`[summarize] No translated_pages for ${date}; skipping.`);
    return emptySummary(true, "no_translated_pages");
  }

  const sortedItems = [...translatedPageItems].sort((a, b) => {
    const aNum = a.slot_key ? (pageNumberFromSlotKey(a.slot_key) ?? 0) : 0;
    const bNum = b.slot_key ? (pageNumberFromSlotKey(b.slot_key) ?? 0) : 0;
    return aNum - bNum;
  });

  const pages: { pageNumber: number; text: string }[] = [];
  for (const item of sortedItems) {
    const pageNumber = item.slot_key
      ? (pageNumberFromSlotKey(item.slot_key) ?? pages.length + 1)
      : pages.length + 1;
    const text = await getR2Text(item.text_r2_key);
    if (!text?.trim()) {
      log(
        `[summarize] Warning: missing R2 text for ${item.text_r2_key}; skipping page ${pageNumber}.`,
      );
      continue;
    }
    pages.push({ pageNumber, text });
  }

  if (pages.length === 0) {
    log(`[summarize] No readable translated page text for ${date}; skipping.`);
    return emptySummary(true, "no_readable_pages");
  }

  log(`[summarize] Summarizing ${pages.length} page(s) with ${model}…`);
  const installmentContext = buildInstallmentContext(date);
  const usage = await summarizeTranslatedPages(
    pages,
    date,
    installmentContext,
    { model, log },
  );

  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const enKey = `${date}/en/${OVERVIEW_SLOT_KEY}/${runStamp}.txt`;
  await putR2Text(enKey, usage.text);
  log(`[summarize] Overview written to R2: ${enKey}`);

  const provenanceItem = sortedItems[0];
  const gallicaUrl = provenanceItem.gallica_url ?? doc.gallica_issue_url ?? "";
  if (!gallicaUrl) {
    throw new Error(
      `[summarize] No gallica_url on translated_pages or doc for ${date}.`,
    );
  }

  const existingItem = getOverviewTextItem(doc);
  if (existingItem && !existingItem.translation_version_id) {
    log(`[summarize] Snapshotting legacy overview item before overwrite.`);
    await snapshotToVersions(supabase, date, "overview", existingItem, log);
  }

  const versionId = await insertVersionRow(supabase, {
    installment_date: date,
    section: "overview",
    slot_key: OVERVIEW_SLOT_KEY,
    text_r2_key: enKey,
    source: "Journal des Débats",
    original_date: date,
    gallica_url: gallicaUrl,
    license: "Public Domain",
    attribution: `Machine summarization by ${usage.model}`,
    model_used: usage.model,
    source_text_url: provenanceItem.source_text_url ?? gallicaUrl,
    fr_intermediate_r2_key: provenanceItem.fr_intermediate_r2_key ?? "",
    cost_usd: usage.cost_usd,
    low_confidence: false,
    admin_notes: null,
  });

  const updatedItem: TextItem = {
    kind: "text",
    text_r2_key: enKey,
    source: "Journal des Débats",
    original_date: date,
    gallica_url: gallicaUrl,
    license: "Public Domain",
    attribution: `Machine summarization by ${usage.model}`,
    contributor_id: existingItem?.contributor_id,
    slot_key: OVERVIEW_SLOT_KEY,
    translation_origin: "machine_claude",
    translation_model: usage.model,
    source_text_url: provenanceItem.source_text_url,
    fr_intermediate_r2_key: provenanceItem.fr_intermediate_r2_key,
    translation_version_id: versionId,
  };

  doc = setSectionTextItems(doc, "overview", [updatedItem]);
  await persistDayDoc(supabase, date, doc, log);

  log(
    `[summarize] Done. cost=$${usage.cost_usd.toFixed(4)} model=${usage.model}`,
  );

  return {
    updated: true,
    skipped: false,
    cost_usd_total: usage.cost_usd,
    model: usage.model,
  };
}
