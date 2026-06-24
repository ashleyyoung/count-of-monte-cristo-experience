/**
 * lib/llm/translate.ts
 *
 * Single Anthropic entry point for the translation subsystem.
 *
 * Rules enforced here:
 *  - Model ids come exclusively from env vars; nothing is hardcoded.
 *  - Lazy-init singleton client (one instance per process lifetime).
 *  - System prompt sent with cache_control: ephemeral so the Débats-voice
 *    prompt amortizes across the batch run.
 *  - All calls stream (messages.stream) to avoid the SDK's non-stream timeout
 *    on long Berlioz feuilletons.
 *  - Retry-with-backoff on transient errors (rate limit, server, connection,
 *    timeout): max 4 attempts, exponential + jitter.
 *  - Returns TranslationUsage with cost_usd computed from inline pricing table.
 *  - Default model: claude-sonnet-4-5. Override via TRANSLATION_MODEL or --model.
 */

import Anthropic, {
  RateLimitError,
  InternalServerError,
  APIConnectionError,
  APIConnectionTimeoutError,
} from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Config (all from env)
// ---------------------------------------------------------------------------

export const PROVIDER = process.env.TRANSLATION_PROVIDER ?? "anthropic";

/**
 * Default: claude-sonnet-4-5 (strong quality at lower cost for bulk day runs).
 * Override via TRANSLATION_MODEL or --model= on translate-day / ingest-day.
 */
export const MODEL = process.env.TRANSLATION_MODEL ?? "claude-sonnet-4-5";

/** Resolve the model for a run: CLI/env override wins over TRANSLATION_MODEL default. */
export function resolveTranslationModel(override?: string): string {
  const trimmed = override?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : MODEL;
}

export interface TranslationBatchOptions {
  log?: TranslationLogFn;
  /** Override TRANSLATION_MODEL for this run (e.g. claude-sonnet-4-5). */
  model?: string;
}

/**
 * Model used for on-demand vision OCR transcription.
 * Falls back to MODEL when unset.
 */
export const VISION_MODEL = process.env.TRANSLATION_VISION_MODEL ?? MODEL;

const API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Max output tokens for the whole-issue translate+segment call. A full 4-page
 * Débats issue translated to English can be large, so this is generous and
 * configurable. Opus 4.8 supports high output limits. If a run still truncates,
 * raise this or split the issue.
 */
const SEGMENT_MAX_TOKENS = Number(
  process.env.TRANSLATION_MAX_OUTPUT_TOKENS ?? "32000",
);

/** Max output tokens for a single-section translation or vision transcription. */
const SINGLE_MAX_TOKENS = Number(
  process.env.TRANSLATION_SINGLE_MAX_OUTPUT_TOKENS ?? "16000",
);

// ---------------------------------------------------------------------------
// Lazy singleton client
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (PROVIDER !== "anthropic") {
    throw new Error(
      `Translation provider "${PROVIDER}" is not implemented. Only "anthropic" is supported.`,
    );
  }
  if (!API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for the translation pipeline. Set it in your environment.",
    );
  }
  if (!_client) {
    // max_retries: 0 — we handle retries ourselves with backoff + jitter.
    _client = new Anthropic({ apiKey: API_KEY, maxRetries: 0 });
  }
  return _client;
}

// ---------------------------------------------------------------------------
// Pricing table (per-million tokens)
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Claude Fable 5 (preferred when unblocked)
  "claude-fable-5": { inputPerMillion: 10, outputPerMillion: 50 },
  // Claude Sonnet 4.5 (current default)
  "claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 },
  // Claude Opus 4.8 (higher quality override)
  "claude-opus-4-8": { inputPerMillion: 5, outputPerMillion: 25 },
  // Claude Haiku 4.5 (bulk / cost-sensitive runs)
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
};

function computeCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const pricing = Object.entries(PRICING).find(([key]) =>
    model.includes(key),
  )?.[1];
  if (!pricing) return 0; // unknown model; log but don't fail
  return (
    (tokensIn / 1_000_000) * pricing.inputPerMillion +
    (tokensOut / 1_000_000) * pricing.outputPerMillion
  );
}

// ---------------------------------------------------------------------------
// Retry-with-backoff
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 4;
const BASE_DELAY_MS = 1_000;

type TransientError =
  | RateLimitError
  | InternalServerError
  | APIConnectionError
  | APIConnectionTimeoutError;

function isTransient(err: unknown): err is TransientError {
  return (
    err instanceof RateLimitError ||
    err instanceof InternalServerError ||
    err instanceof APIConnectionError ||
    err instanceof APIConnectionTimeoutError
  );
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (isTransient(err) && attempt < MAX_ATTEMPTS) {
        const jitter = Math.random() * 500;
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1) + jitter;
        console.warn(
          `[translate] Transient error (attempt ${attempt}/${MAX_ATTEMPTS}): ${
            (err as Error).message
          }. Retrying in ${Math.round(delay)}ms…`,
        );
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
  // Unreachable but satisfies TypeScript
  throw new Error("[translate] Retry loop exhausted");
}

// ---------------------------------------------------------------------------
// Per-call logging
// ---------------------------------------------------------------------------

export type TranslationLogFn = (msg: string) => void;

function translationLog(log?: TranslationLogFn): TranslationLogFn {
  return log ?? ((msg) => console.error(msg));
}

function summarizeSegmented(seg: SegmentedTranslation): string {
  const parts: string[] = [];
  const add = (name: string, s: SectionTranslation | null | undefined) => {
    const len = s?.text?.trim().length ?? 0;
    if (len > 0) parts.push(`${name}=${len}ch`);
  };
  add("overview", seg.overview);
  add("chapter", seg.chapter);
  add("debats.music", seg.debats?.music);
  add("debats.theater", seg.debats?.theater);
  add("debats.art", seg.debats?.art);
  add("debats.literature", seg.debats?.literature);
  add("art_exhibitions", seg.art_exhibitions);
  add("science", seg.science);
  return parts.length > 0 ? parts.join(", ") : "none";
}

interface CallLogContext {
  log?: TranslationLogFn;
  date: string;
  label: string;
  operation: "translate" | "segment" | "vision";
  inputChars: number;
  maxTokens: number;
  model: string;
}

function logCallStart(ctx: CallLogContext): void {
  const log = translationLog(ctx.log);
  log(
    `[translate] → ${ctx.label} ${ctx.operation}: sending ${ctx.inputChars.toLocaleString()} chars ` +
      `(max_output=${ctx.maxTokens.toLocaleString()}, model=${ctx.model})`,
  );
}

function logCallOk(
  ctx: CallLogContext,
  details: {
    durationMs: number;
    tokensIn: number;
    tokensOut: number;
    outputChars: number;
    costUsd: number;
    stopReason: string;
    extra?: string;
  },
): void {
  const log = translationLog(ctx.log);
  const secs = (details.durationMs / 1000).toFixed(1);
  const extra = details.extra ? ` — ${details.extra}` : "";
  log(
    `[translate] ok ${ctx.label} ${ctx.operation}: ${secs}s, ` +
      `${details.tokensIn.toLocaleString()} in / ${details.tokensOut.toLocaleString()} out, ` +
      `${details.outputChars.toLocaleString()} chars en, $${details.costUsd.toFixed(4)}, ` +
      `stop=${details.stopReason}${extra}`,
  );
}

function logCallFailed(
  ctx: CallLogContext,
  details: { durationMs: number; error: string },
): void {
  const log = translationLog(ctx.log);
  const secs = (details.durationMs / 1000).toFixed(1);
  log(
    `[translate] failed ${ctx.label} ${ctx.operation}: ${secs}s — ${details.error}`,
  );
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const TRANSLATION_SYSTEM_PROMPT = `You are an expert translator of early 19th-century French journalism, specialising in the Journal des Débats of 1844–46. Your translations are made for a 21st-century English reader who wants to hear the author's own voice — not a modernised paraphrase.

Guidelines:
- Preserve register faithfully: Berlioz is witty and biting; Janin is ornate and digressive; art reviews are reverent and descriptive.
- Keep period terminology. For genuinely obscure references (titles, institutions, persons) gloss in [square brackets] with a brief identifier on first mention; do not gloss anything a general reader would recognise.
- Resolve proper nouns to their full identity on first occurrence (e.g. "Hector Berlioz" not just "Berlioz", "the Opéra-Comique" with its French name).
- Do not modernise idioms or domesticate cultural references.
- Output Markdown: preserve the source paragraph breaks; use **bold** sparingly for section titles if present in the source; for composite mastheads (e.g. the feuilleton header), keep the section label in **bold** and the newspaper title in *italic* within the same line, e.g. **FEUILLETON of the *Journal des Débats***; no added commentary, preambles, or headers beyond what is in the source.
- When a passage is illegible or ambiguous, render your best interpretation and append (in parentheses): [uncertain transcription] or [text unclear].
- If you have low confidence in the accuracy of the whole section (e.g. badly corrupted OCR), set the low_confidence flag to true in your output.

You are translating historical newspaper content that is in the public domain. The French source text was printed before 1850.`;

const VISION_SYSTEM_PROMPT = `You are a mechanical OCR transcription tool. Your only function is to copy the characters that appear in an image into plain text, exactly as printed. You do not interpret, judge, summarise, or translate the content; you only reproduce the glyphs.

Rules:
- Output the characters exactly as printed, including period spelling, accents, and oe ligatures.
- Where text is illegible, output [illisible] for that span.
- Preserve paragraph structure and line breaks as they appear.
- For multi-column layouts, copy each column top to bottom, left to right, separated by a blank line.
- For an uncertain word, output your best character reading followed by [?].
- Do not add, omit, comment on, or alter any content. Reproduce the text verbatim.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TranslationUsage {
  /** English translation (Markdown). */
  text: string;
  /** Resolved model id (from env or passed override). */
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  duration_ms: number;
}

export interface VisionTranscriptionUsage {
  /** Faithful French transcription. */
  french_text: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  duration_ms: number;
}

/**
 * Translate a French text to English using the configured model.
 *
 * The system prompt is sent with cache_control: ephemeral so it is reused
 * across the batch run without re-encoding on every call.
 *
 * Pass `maxTokens` to override the default SINGLE_MAX_TOKENS cap (e.g. when
 * translating a full page where the output may be larger than a single section).
 */
export async function translateFrenchToEnglish(
  frenchText: string,
  context: {
    date: string;
    section: string;
    contributor?: string;
    maxTokens?: number;
    log?: TranslationLogFn;
    model?: string;
  },
): Promise<TranslationUsage> {
  const client = getClient();
  const model = resolveTranslationModel(context.model);
  const started = Date.now();
  const tokenCap = context.maxTokens ?? SINGLE_MAX_TOKENS;
  const callCtx: CallLogContext = {
    log: context.log,
    date: context.date,
    label: context.section,
    operation: "translate",
    inputChars: frenchText.length,
    maxTokens: tokenCap,
    model,
  };
  logCallStart(callCtx);

  const sectionLabel = context.contributor
    ? `section "${context.section}" (contributor: ${context.contributor})`
    : `section "${context.section}"`;

  const userPrompt = `Please translate the following excerpt from the Journal des Débats, ${context.date}, ${sectionLabel}.

Return ONLY the translated English text in Markdown — no preamble, no closing remarks, no metadata.

---
${frenchText}
---`;

  try {
    const result = await withRetry(async () => {
      const stream = await client.messages.stream({
        model,
        max_tokens: tokenCap,
        system: [
          {
            type: "text",
            text: TRANSLATION_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      });
      return await stream.finalMessage();
    });

    if (result.stop_reason === "max_tokens") {
      throw new Error(
        `hit ${tokenCap}-token output cap` +
          (tokenCap < SEGMENT_MAX_TOKENS
            ? ` (raise TRANSLATION_SINGLE_MAX_OUTPUT_TOKENS, currently ${SINGLE_MAX_TOKENS})`
            : " (already at model maximum)"),
      );
    }

    const textBlock = result.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("no text block in Anthropic response");
    }

    const tokensIn = result.usage.input_tokens;
    const tokensOut = result.usage.output_tokens;
    const durationMs = Date.now() - started;
    const costUsd = computeCost(model, tokensIn, tokensOut);

    logCallOk(callCtx, {
      durationMs,
      tokensIn,
      tokensOut,
      outputChars: textBlock.text.length,
      costUsd,
      stopReason: result.stop_reason ?? "unknown",
    });

    return {
      text: textBlock.text,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      duration_ms: durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logCallFailed(callCtx, {
      durationMs: Date.now() - started,
      error: message,
    });
    throw err instanceof Error ? err : new Error(message);
  }
}

import { splitFrenchPages } from "@/lib/translate/french-pages";

export {
  splitFrenchPages,
  type FrenchPageChunk,
} from "@/lib/translate/french-pages";

function parseSegmentationJson(rawText: string): SegmentedTranslation {
  let raw = rawText
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  // Salvage responses that start mid-object (e.g. ":{\"overview\"…").
  const firstBrace = raw.indexOf("{");
  if (firstBrace > 0) {
    raw = raw.slice(firstBrace);
  }

  try {
    return JSON.parse(raw) as SegmentedTranslation;
  } catch (err) {
    throw new Error(
      `[translate] Failed to parse segmentation JSON: ${(err as Error).message}\n\nRaw: ${rawText.slice(0, 500)}`,
    );
  }
}

function mergeSectionTranslations(
  sections: Array<SectionTranslation | null | undefined>,
): SectionTranslation | null {
  const parts: SectionTranslation[] = [];
  for (const s of sections) {
    if (s?.text?.trim()) parts.push(s);
  }
  if (parts.length === 0) return null;

  return {
    text: parts.map((s) => s.text.trim()).join("\n\n"),
    low_confidence: parts.some((s) => s.low_confidence),
    admin_notes:
      parts
        .map((s) => s.admin_notes?.trim())
        .filter((n): n is string => Boolean(n))
        .join("; ") || undefined,
  };
}

function mergeSegmentedTranslations(
  pages: SegmentedTranslation[],
): SegmentedTranslation {
  return {
    overview: mergeSectionTranslations(pages.map((p) => p.overview)),
    chapter: mergeSectionTranslations(pages.map((p) => p.chapter)),
    debats: {
      music: mergeSectionTranslations(pages.map((p) => p.debats?.music)),
      theater: mergeSectionTranslations(pages.map((p) => p.debats?.theater)),
      art: mergeSectionTranslations(pages.map((p) => p.debats?.art)),
      literature: mergeSectionTranslations(
        pages.map((p) => p.debats?.literature),
      ),
    },
    art_exhibitions: mergeSectionTranslations(
      pages.map((p) => p.art_exhibitions),
    ),
    science: mergeSectionTranslations(pages.map((p) => p.science)),
  };
}

/**
 * Translate a French text to English AND segment it into the fixed Débats sections.
 *
 * Returns structured JSON with one entry per known section. Sections not
 * present in the source text are returned as null. Sections with low OCR
 * confidence have low_confidence: true.
 */
export interface SegmentedTranslation {
  overview: SectionTranslation | null;
  chapter: SectionTranslation | null;
  debats: {
    music: SectionTranslation | null;
    theater: SectionTranslation | null;
    art: SectionTranslation | null;
    literature: SectionTranslation | null;
  };
  art_exhibitions: SectionTranslation | null;
  science: SectionTranslation | null;
}

export interface SectionTranslation {
  text: string;
  low_confidence: boolean;
  admin_notes?: string;
}

export async function translateAndSegment(
  frenchText: string,
  date: string,
  options: { pageNumber?: number; log?: TranslationLogFn; model?: string } = {},
): Promise<{
  result: SegmentedTranslation;
  usage: Omit<TranslationUsage, "text">;
}> {
  const client = getClient();
  const model = resolveTranslationModel(options.model);
  const started = Date.now();
  const label =
    options.pageNumber != null ? `page-${options.pageNumber}` : "full-issue";
  const callCtx: CallLogContext = {
    log: options.log,
    date,
    label,
    operation: "segment",
    inputChars: frenchText.length,
    maxTokens: SEGMENT_MAX_TOKENS,
    model,
  };
  logCallStart(callCtx);

  const pageLabel =
    options.pageNumber != null
      ? `page ${options.pageNumber} of the issue`
      : "the full issue";

  const userPrompt = `Below is ${pageLabel} from the Journal des Débats, ${date}.

Your task:
1. Identify which passages on this page correspond to each of the fixed sections listed below.
2. Translate EACH section's passages to English (faithfully, per the system prompt guidelines).
3. Return a JSON object with EXACTLY this shape. For sections not present on this page, use null.

Schema:
{
  "overview": { "text": "<English Markdown>", "low_confidence": <bool>, "admin_notes": "<optional string>" } | null,
  "chapter": { "text": "<English Markdown>", "low_confidence": <bool>, "admin_notes": "<optional string>" } | null,
  "debats": {
    "music": { "text": "<English Markdown>", "low_confidence": <bool> } | null,
    "theater": { "text": "<English Markdown>", "low_confidence": <bool> } | null,
    "art": { "text": "<English Markdown>", "low_confidence": <bool> } | null,
    "literature": { "text": "<English Markdown>", "low_confidence": <bool> } | null
  },
  "art_exhibitions": { "text": "<English Markdown>", "low_confidence": <bool> } | null,
  "science": { "text": "<English Markdown>", "low_confidence": <bool> } | null
}

Section identification guide:
- "overview": general news, politics, Paris society items at the top of the paper.
- "chapter": the roman-feuilleton (novel serialisation — Dumas's "Le Comte de Monte-Cristo" in this period) printed in the bottom strip.
- "debats.music": feuilleton music criticism (Berlioz in this period; typically signed H. BERLIOZ or H. B.).
- "debats.theater": theater and opera reviews.
- "debats.art": fine art reviews and criticism.
- "debats.literature": literary reviews and book notices.
- "art_exhibitions": Salon and gallery coverage (may overlap with debats.art; include here if standalone).
- "science": science, technology, and natural philosophy reports.

Do NOT include Galignani's Messenger content — that is a separate English newspaper, not part of this French issue.

Return ONLY the JSON object — no preamble, no markdown code fences.

---
${frenchText}
---`;

  try {
    const rawResult = await withRetry(async () => {
      const stream = await client.messages.stream({
        model,
        max_tokens: SEGMENT_MAX_TOKENS,
        system: [
          {
            type: "text",
            text: TRANSLATION_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      });
      return await stream.finalMessage();
    });

    if (rawResult.stop_reason === "max_tokens") {
      throw new Error(`hit ${SEGMENT_MAX_TOKENS}-token output cap`);
    }

    const textBlock = rawResult.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("no text block in segmentation response");
    }

    const parsed = parseSegmentationJson(textBlock.text);

    const tokensIn = rawResult.usage.input_tokens;
    const tokensOut = rawResult.usage.output_tokens;
    const durationMs = Date.now() - started;
    const costUsd = computeCost(model, tokensIn, tokensOut);

    logCallOk(callCtx, {
      durationMs,
      tokensIn,
      tokensOut,
      outputChars: textBlock.text.length,
      costUsd,
      stopReason: rawResult.stop_reason ?? "unknown",
      extra: `sections: ${summarizeSegmented(parsed)}`,
    });

    return {
      result: parsed,
      usage: {
        model,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_usd: costUsd,
        duration_ms: durationMs,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logCallFailed(callCtx, {
      durationMs: Date.now() - started,
      error: message,
    });
    throw err instanceof Error
      ? err
      : new Error(
          `[translate] Segmentation failed for ${date} (${label}): ${message}`,
        );
  }
}

/**
 * Segment and translate an issue page by page, then merge section results.
 *
 * Each page is sent to translateAndSegment independently (~25–30k chars of
 * French per page for a typical 4-page Débats issue) so output stays within
 * the model's JSON budget.
 */
export async function translateAndSegmentByPage(
  frenchText: string,
  date: string,
  options: TranslationBatchOptions = {},
): Promise<{
  result: SegmentedTranslation;
  usage: Omit<TranslationUsage, "text">;
  pageCount: number;
}> {
  const writeLog = translationLog(options.log);
  const modelOverride = resolveTranslationModel(options.model);
  const chunks = splitFrenchPages(frenchText);
  if (chunks.length === 0) {
    throw new Error(
      `[translate] No French page content to segment for ${date}.`,
    );
  }

  const totalChars = chunks.reduce((n, c) => n + c.text.length, 0);
  writeLog(
    `[translate] segment-by-page: ${chunks.length} page(s), ${totalChars.toLocaleString()} chars total for ${date}`,
  );

  const pageResults: SegmentedTranslation[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;
  let totalMs = 0;
  let model = modelOverride;

  for (let i = 0; i < chunks.length; i++) {
    const { pageNumber, text } = chunks[i];
    writeLog(
      `[translate] segment-by-page: page ${i + 1}/${chunks.length} (page ${pageNumber}, ${text.length.toLocaleString()} chars)`,
    );
    const { result, usage } = await translateAndSegment(text, date, {
      pageNumber,
      log: options.log,
      model: modelOverride,
    });
    pageResults.push(result);
    totalIn += usage.tokens_in;
    totalOut += usage.tokens_out;
    totalCost += usage.cost_usd;
    totalMs += usage.duration_ms;
    model = usage.model;
  }

  const merged = mergeSegmentedTranslations(pageResults);
  writeLog(
    `[translate] segment-by-page done: ${chunks.length} page(s) in ${(totalMs / 1000).toFixed(1)}s, ` +
      `${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out, $${totalCost.toFixed(4)} — ` +
      `merged sections: ${summarizeSegmented(merged)}`,
  );

  return {
    result: merged,
    pageCount: chunks.length,
    usage: {
      model,
      tokens_in: totalIn,
      tokens_out: totalOut,
      cost_usd: totalCost,
      duration_ms: totalMs,
    },
  };
}

/**
 * Transcribe printed French text from a scan image using the vision model.
 *
 * The image is sent as base64-encoded data. Returns a faithful verbatim
 * French transcription (NOT a translation). The admin then runs
 * translateFrenchToEnglish() on the output to produce a comparable
 * machine_claude version flagged low_confidence.
 */
export async function transcribePageImage(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  context: { date: string; page: number },
): Promise<VisionTranscriptionUsage> {
  const client = getClient();
  const model = VISION_MODEL;
  const started = Date.now();

  const userPrompt = `Please transcribe the text from this image exactly as written, without altering the content. Copy the characters top to bottom, left to right, and return only the transcribed text.`;

  let result;
  try {
    result = await withRetry(async () => {
      const stream = await client.messages.stream({
        model,
        max_tokens: SINGLE_MAX_TOKENS,
        system: [
          {
            type: "text",
            text: VISION_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              { type: "text", text: userPrompt },
            ],
          },
        ],
      });
      return await stream.finalMessage();
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/content filtering/i.test(msg)) {
      throw new Error(
        `[translate] Vision transcription blocked by Anthropic content filtering ` +
          `(${context.date} page ${context.page + 1}). ` +
          `Use Gallica OCR instead: npx tsx scripts/translate/fetch-french-textebrut.ts --date=${context.date}`,
        { cause: err },
      );
    }
    throw err;
  }

  if (result.stop_reason === "max_tokens") {
    throw new Error(
      `[translate] Vision transcription hit the ${SINGLE_MAX_TOKENS}-token output cap and was truncated ` +
        `(${context.date} page ${context.page + 1}). Raise TRANSLATION_SINGLE_MAX_OUTPUT_TOKENS.`,
    );
  }

  const textBlock = result.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(
      "[translate] No text block in vision transcription response",
    );
  }

  const tokensIn = result.usage.input_tokens;
  const tokensOut = result.usage.output_tokens;

  return {
    french_text: textBlock.text,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: computeCost(model, tokensIn, tokensOut),
    duration_ms: Date.now() - started,
  };
}

// ---------------------------------------------------------------------------
// Per-page full-paper translation
// ---------------------------------------------------------------------------

export interface PageTranslationResult {
  pageNumber: number;
  text: string;
}

/**
 * Translate a stitched ALTO / texteBrut document page by page.
 *
 * The French source uses `--- Page N ---` section markers produced by
 * ALTO stitching. This function splits on those markers and calls
 * translateFrenchToEnglish once per page. Each call uses SEGMENT_MAX_TOKENS —
 * the model's highest supported output cap — so no page is truncated.
 *
 * When no markers are found (plain texteBrut), the entire text is treated
 * as page 1 and translated as a single call.
 */
export async function translatePaperPages(
  frenchText: string,
  date: string,
  options: TranslationBatchOptions = {},
): Promise<{
  pages: PageTranslationResult[];
  totalUsage: Omit<TranslationUsage, "text">;
}> {
  const writeLog = translationLog(options.log);
  const modelOverride = resolveTranslationModel(options.model);
  const chunks = splitFrenchPages(frenchText);
  const totalChars = chunks.reduce((n, c) => n + c.text.length, 0);
  writeLog(
    `[translate] translate-by-page: ${chunks.length} page(s), ${totalChars.toLocaleString()} chars total for ${date}`,
  );

  const pages: PageTranslationResult[] = [];
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;
  let totalMs = 0;

  for (let i = 0; i < chunks.length; i++) {
    const { pageNumber, text } = chunks[i];
    writeLog(
      `[translate] translate-by-page: page ${i + 1}/${chunks.length} (page ${pageNumber}, ${text.length.toLocaleString()} chars)`,
    );
    const result = await translateFrenchToEnglish(text, {
      date,
      section: `page-${pageNumber}`,
      maxTokens: SEGMENT_MAX_TOKENS,
      log: options.log,
      model: modelOverride,
    });
    pages.push({ pageNumber, text: result.text });
    totalIn += result.tokens_in;
    totalOut += result.tokens_out;
    totalCost += result.cost_usd;
    totalMs += result.duration_ms;
  }

  writeLog(
    `[translate] translate-by-page done: ${chunks.length} page(s) in ${(totalMs / 1000).toFixed(1)}s, ` +
      `${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out, $${totalCost.toFixed(4)}`,
  );

  return {
    pages,
    totalUsage: {
      model: modelOverride,
      tokens_in: totalIn,
      tokens_out: totalOut,
      cost_usd: totalCost,
      duration_ms: totalMs,
    },
  };
}

/** Currently configured translation model id (for logging / admin display). */
export function getTranslationModel(): string {
  return MODEL;
}

/** Currently configured translation provider. */
export function getTranslationProvider(): string {
  return PROVIDER;
}
