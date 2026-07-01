/**
 * lib/llm/translate-batch.ts
 *
 * Anthropic Message Batches API (50% token discount) for translation runs.
 * Used by default for translate-day / translate-all; disable with
 * TRANSLATION_USE_BATCH=0 or --sync on translate-day.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";
import {
  loadAnchorPageFromR2,
  saveAnchorPageToR2,
} from "@/lib/translate/segment-cache";
import {
  getAnthropicClient,
  resolveTranslationModel,
  resolveTokenUsage,
  computeCostFromUsage,
  translationSystemPrompt,
  buildPageTranslateUserPrompt,
  buildAnchorSegmentUserPrompt,
  parseAnchorJson,
  sliceEnglishByAnchors,
  splitFrenchPages,
  translateAndSegment,
  mergeSegmentedTranslations,
  type AnthropicTokenUsage,
  type TranslationLogFn,
  type TranslationUsage,
  type TranslationBatchOptions,
  type PageTranslationResult,
  type SegmentedTranslation,
  type SectionAnchor,
  getSegmentMaxOutputTokens,
  ANCHOR_MAX_OUTPUT_TOKENS,
} from "./translate";

const BATCH_POLL_MS = Number(process.env.TRANSLATION_BATCH_POLL_MS ?? "5000");
const BATCH_POLL_MAX_MS = Number(
  process.env.TRANSLATION_BATCH_POLL_MAX_MS ?? String(24 * 60 * 60 * 1000),
);

/** True unless TRANSLATION_USE_BATCH=0. */
export function isMessageBatchEnabled(): boolean {
  return process.env.TRANSLATION_USE_BATCH !== "0";
}

export type BatchRequestParams = MessageCreateParamsNonStreaming;

export interface BatchRequestSpec {
  custom_id: string;
  params: BatchRequestParams;
}

export type BatchResultEntry =
  | {
      ok: true;
      text: string;
      usage: AnthropicTokenUsage;
      model: string;
    }
  | { ok: false; error: string };

function translationLog(log?: TranslationLogFn): TranslationLogFn {
  return log ?? ((msg) => console.error(msg));
}

function systemBlocks(): BatchRequestParams["system"] {
  return [
    {
      type: "text",
      text: translationSystemPrompt(),
      cache_control: { type: "ephemeral" },
    },
  ];
}

function batchCost(model: string, usage: AnthropicTokenUsage): number {
  return computeCostFromUsage(model, usage, { messageBatch: true });
}

function extractTextFromMessage(
  message: Anthropic.Messages.Message,
): string | null {
  const block = message.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text : null;
}

function emptySegmentedTranslation(): SegmentedTranslation {
  return {
    news: null,
    society: null,
    scandals: null,
    chapter: null,
    debats: {
      music: null,
      theater: null,
      art: null,
      literature: null,
    },
    art_exhibitions: null,
    science: null,
  };
}

function summarizeSegmented(seg: SegmentedTranslation): string {
  const parts: string[] = [];
  const add = (name: string, text: string | undefined | null) => {
    const len = text?.trim().length ?? 0;
    if (len > 0) parts.push(`${name}=${len}ch`);
  };
  add("news", seg.news?.text);
  add("society", seg.society?.text);
  add("scandals", seg.scandals?.text);
  add("chapter", seg.chapter?.text);
  add("debats.music", seg.debats?.music?.text);
  add("debats.theater", seg.debats?.theater?.text);
  add("debats.art", seg.debats?.art?.text);
  add("debats.literature", seg.debats?.literature?.text);
  add("art_exhibitions", seg.art_exhibitions?.text);
  add("science", seg.science?.text);
  return parts.length > 0 ? parts.join(", ") : "none";
}

export async function waitForMessageBatch(
  batchId: string,
  log?: TranslationLogFn,
): Promise<void> {
  const writeLog = translationLog(log);
  const client = getAnthropicClient();
  const started = Date.now();

  while (true) {
    const batch = await client.messages.batches.retrieve(batchId);
    const counts = batch.request_counts;
    writeLog(
      `[translate-batch] ${batchId}: status=${batch.processing_status}` +
        (counts
          ? ` (processing=${counts.processing} succeeded=${counts.succeeded} errored=${counts.errored} canceled=${counts.canceled} expired=${counts.expired})`
          : ""),
    );

    if (batch.processing_status === "ended") {
      return;
    }

    if (Date.now() - started > BATCH_POLL_MAX_MS) {
      throw new Error(
        `[translate-batch] Batch ${batchId} did not finish within ${BATCH_POLL_MAX_MS}ms`,
      );
    }

    await new Promise((r) => setTimeout(r, BATCH_POLL_MS));
  }
}

export async function collectMessageBatchResults(
  batchId: string,
): Promise<Map<string, BatchResultEntry>> {
  const client = getAnthropicClient();
  const results = new Map<string, BatchResultEntry>();
  const stream = await client.messages.batches.results(batchId);

  for await (const entry of stream) {
    if (entry.result.type === "succeeded") {
      const text = extractTextFromMessage(entry.result.message);
      if (!text) {
        results.set(entry.custom_id, {
          ok: false,
          error: "no text block in batch response",
        });
        continue;
      }
      results.set(entry.custom_id, {
        ok: true,
        text,
        usage: entry.result.message.usage,
        model: entry.result.message.model,
      });
    } else if (entry.result.type === "errored") {
      const err = entry.result.error;
      const message =
        err.type === "error"
          ? `${err.error.type}: ${err.error.message}`
          : `batch error: ${err.type}`;
      results.set(entry.custom_id, { ok: false, error: message });
    } else {
      results.set(entry.custom_id, {
        ok: false,
        error: `batch result type: ${entry.result.type}`,
      });
    }
  }

  return results;
}

export async function runMessageBatch(
  label: string,
  requests: BatchRequestSpec[],
  log?: TranslationLogFn,
): Promise<Map<string, BatchResultEntry>> {
  const writeLog = translationLog(log);
  if (requests.length === 0) {
    return new Map();
  }

  const client = getAnthropicClient();
  const started = Date.now();
  writeLog(
    `[translate-batch] Submitting ${label}: ${requests.length} request(s)…`,
  );

  const batch = await client.messages.batches.create({ requests });
  writeLog(`[translate-batch] ${label} batch id=${batch.id}`);

  await waitForMessageBatch(batch.id, log);
  const results = await collectMessageBatchResults(batch.id);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const ok = [...results.values()].filter((r) => r.ok).length;
  writeLog(
    `[translate-batch] ${label} done in ${elapsed}s: ${ok}/${requests.length} succeeded (50% batch pricing)`,
  );

  return results;
}

export function translatePageCustomId(pageNumber: number): string {
  return `tr_page_${pageNumber}`;
}

export function anchorPageCustomId(pageNumber: number): string {
  return `an_page_${pageNumber}`;
}

export function buildTranslatePageBatchRequest(
  pageNumber: number,
  frenchText: string,
  date: string,
  model: string,
): BatchRequestSpec {
  return {
    custom_id: translatePageCustomId(pageNumber),
    params: {
      model,
      max_tokens: getSegmentMaxOutputTokens(model),
      system: systemBlocks(),
      messages: [
        {
          role: "user",
          content: buildPageTranslateUserPrompt(date, pageNumber, frenchText),
        },
      ],
    },
  };
}

export function buildAnchorPageBatchRequest(
  pageNumber: number,
  englishText: string,
  date: string,
  model: string,
): BatchRequestSpec {
  return {
    custom_id: anchorPageCustomId(pageNumber),
    params: {
      model,
      max_tokens: ANCHOR_MAX_OUTPUT_TOKENS,
      system: systemBlocks(),
      messages: [
        {
          role: "user",
          content: buildAnchorSegmentUserPrompt(date, pageNumber, englishText),
        },
      ],
    },
  };
}

export function aggregateBatchUsage(
  entries: Iterable<BatchResultEntry>,
  model: string,
  durationMs: number,
): Omit<TranslationUsage, "text"> {
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;
  let resolvedModel = model;

  for (const entry of entries) {
    if (!entry.ok) continue;
    const resolved = resolveTokenUsage(entry.usage);
    totalIn += resolved.total_input;
    totalOut += resolved.output;
    totalCost += batchCost(entry.model, entry.usage);
    resolvedModel = entry.model;
  }

  return {
    model: resolvedModel,
    tokens_in: totalIn,
    tokens_out: totalOut,
    cost_usd: totalCost,
    duration_ms: durationMs,
  };
}

/** Pass A via Message Batches API (50% off). */
export async function translatePaperPagesViaMessageBatch(
  frenchText: string,
  date: string,
  options: TranslationBatchOptions = {},
): Promise<{
  pages: PageTranslationResult[];
  totalUsage: Omit<TranslationUsage, "text">;
}> {
  const writeLog = translationLog(options.log);
  const model = resolveTranslationModel(options.model);
  const chunks = splitFrenchPages(frenchText);
  const totalChars = chunks.reduce((n, c) => n + c.text.length, 0);
  writeLog(
    `[translate] translate-by-page (batch): ${chunks.length} page(s), ${totalChars.toLocaleString()} chars total for ${date}`,
  );

  const toTranslate = chunks.filter(
    (c) => !options.skipPageNumbers?.has(c.pageNumber),
  );
  const started = Date.now();

  const requests = toTranslate.map((c) =>
    buildTranslatePageBatchRequest(c.pageNumber, c.text, date, model),
  );

  const results = await runMessageBatch(
    "page-translate",
    requests,
    options.log,
  );

  const pages: PageTranslationResult[] = [];
  const usageEntries: BatchResultEntry[] = [];

  for (const chunk of toTranslate) {
    const customId = translatePageCustomId(chunk.pageNumber);
    const entry = results.get(customId);
    if (!entry) {
      throw new Error(
        `[translate-batch] Missing batch result for page ${chunk.pageNumber}`,
      );
    }
    if (!entry.ok) {
      throw new Error(
        `[translate-batch] Page ${chunk.pageNumber} failed: ${entry.error}`,
      );
    }
    pages.push({ pageNumber: chunk.pageNumber, text: entry.text });
    usageEntries.push(entry);
    writeLog(
      `[translate] translate-by-page (batch): page ${chunk.pageNumber} ok (${entry.text.length.toLocaleString()} chars en)`,
    );
  }

  const totalUsage = aggregateBatchUsage(
    usageEntries,
    model,
    Date.now() - started,
  );

  writeLog(
    `[translate] translate-by-page (batch) done: ${pages.length} new page(s) in ${(totalUsage.duration_ms / 1000).toFixed(1)}s, ` +
      `${totalUsage.tokens_in.toLocaleString()} in / ${totalUsage.tokens_out.toLocaleString()} out, $${totalUsage.cost_usd.toFixed(4)}`,
  );

  return { pages, totalUsage };
}

/** Pass B via Message Batches API (50% off). */
export async function segmentEnglishByPageViaMessageBatch(
  englishPages: PageTranslationResult[],
  date: string,
  options: TranslationBatchOptions & { frenchText?: string } = {},
): Promise<{
  result: SegmentedTranslation;
  usage: Omit<TranslationUsage, "text">;
  pageCount: number;
}> {
  const writeLog = translationLog(options.log);
  const modelOverride = resolveTranslationModel(options.model);
  const writeCache = options.writeSegmentCache !== false;
  const frenchByPage = new Map<number, string>();
  if (options.frenchText) {
    for (const chunk of splitFrenchPages(options.frenchText)) {
      frenchByPage.set(chunk.pageNumber, chunk.text);
    }
  }

  if (englishPages.length === 0) {
    throw new Error(`[translate] No English pages to segment for ${date}.`);
  }

  const pageResults: SegmentedTranslation[] = [];
  const batchSpecs: Array<{
    index: number;
    pageNumber: number;
    englishText: string;
  }> = [];

  for (let i = 0; i < englishPages.length; i++) {
    const { pageNumber, text: englishText } = englishPages[i];

    if (!englishText.trim()) {
      writeLog(
        `[translate] segment-english (batch): page ${pageNumber} — empty, skipping`,
      );
      pageResults[i] = emptySegmentedTranslation();
      continue;
    }

    if (options.useSegmentCache) {
      const cached = await loadAnchorPageFromR2(date, pageNumber);
      if (cached && Array.isArray((cached as { anchors?: unknown }).anchors)) {
        try {
          pageResults[i] = sliceEnglishByAnchors(
            englishText,
            (cached as { anchors: SectionAnchor[] }).anchors,
          );
          writeLog(
            `[translate] segment-english (batch): page ${pageNumber} — loaded anchors from R2 cache`,
          );
          continue;
        } catch {
          writeLog(
            `[translate] segment-english (batch): page ${pageNumber} — cached anchors failed to slice, re-segmenting`,
          );
        }
      }
    }

    batchSpecs.push({ index: i, pageNumber, englishText });
  }

  const started = Date.now();
  const requests = batchSpecs.map((spec) =>
    buildAnchorPageBatchRequest(
      spec.pageNumber,
      spec.englishText,
      date,
      modelOverride,
    ),
  );

  const batchResults = await runMessageBatch(
    "anchor-segment",
    requests,
    options.log,
  );

  const usageEntries: BatchResultEntry[] = [];
  const fallbackSpecs: Array<{
    index: number;
    pageNumber: number;
    error: string;
  }> = [];

  for (const spec of batchSpecs) {
    const customId = anchorPageCustomId(spec.pageNumber);
    const entry = batchResults.get(customId);
    if (!entry?.ok) {
      fallbackSpecs.push({
        index: spec.index,
        pageNumber: spec.pageNumber,
        error: entry?.ok === false ? entry.error : "missing batch result",
      });
      continue;
    }

    try {
      const anchors = parseAnchorJson(entry.text);
      if (writeCache) {
        await saveAnchorPageToR2(date, spec.pageNumber, { anchors });
      }
      pageResults[spec.index] = sliceEnglishByAnchors(
        spec.englishText,
        anchors,
      );
      usageEntries.push(entry);
      writeLog(
        `[translate] segment-english (batch): page ${spec.pageNumber} ok (${anchors.length} anchor(s))`,
      );
    } catch (sliceErr) {
      fallbackSpecs.push({
        index: spec.index,
        pageNumber: spec.pageNumber,
        error: sliceErr instanceof Error ? sliceErr.message : String(sliceErr),
      });
    }
  }

  let fallbackIn = 0;
  let fallbackOut = 0;
  let fallbackCost = 0;
  let resolvedModel = modelOverride;

  for (const fb of fallbackSpecs) {
    const frenchPage = frenchByPage.get(fb.pageNumber);
    writeLog(
      `[translate] segment-english (batch): page ${fb.pageNumber} streaming fallback (${fb.error})`,
    );
    if (!frenchPage?.trim()) {
      throw new Error(
        `[translate-batch] Page ${fb.pageNumber} anchor batch failed and no French fallback: ${fb.error}`,
      );
    }
    const fallback = await translateAndSegment(frenchPage, date, {
      pageNumber: fb.pageNumber,
      log: options.log,
      model: modelOverride,
    });
    pageResults[fb.index] = fallback.result;
    fallbackIn += fallback.usage.tokens_in;
    fallbackOut += fallback.usage.tokens_out;
    fallbackCost += fallback.usage.cost_usd;
    resolvedModel = fallback.usage.model;
  }

  const merged = mergeSegmentedTranslations(
    englishPages.map((_, i) => pageResults[i] ?? emptySegmentedTranslation()),
  );

  const batchUsage = aggregateBatchUsage(
    usageEntries,
    modelOverride,
    Date.now() - started,
  );

  const totalUsage: Omit<TranslationUsage, "text"> = {
    model: resolvedModel,
    tokens_in: batchUsage.tokens_in + fallbackIn,
    tokens_out: batchUsage.tokens_out + fallbackOut,
    cost_usd: batchUsage.cost_usd + fallbackCost,
    duration_ms: batchUsage.duration_ms,
  };

  writeLog(
    `[translate] segment-english (batch) done: ${englishPages.length} page(s) in ${(totalUsage.duration_ms / 1000).toFixed(1)}s, ` +
      `${totalUsage.tokens_in.toLocaleString()} in / ${totalUsage.tokens_out.toLocaleString()} out, $${totalUsage.cost_usd.toFixed(4)} — ` +
      `merged sections: ${summarizeSegmented(merged)}`,
  );

  return {
    result: merged,
    pageCount: englishPages.length,
    usage: totalUsage,
  };
}
