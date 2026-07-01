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
 *  - All calls stream (messages.stream) unless Message Batches API is enabled
 *    (TRANSLATION_USE_BATCH, default on) for 50% token discount on day runs.
 *  - Retry-with-backoff on transient errors (rate limit, server, connection,
 *    timeout): max 4 attempts, exponential + jitter.
 *  - Returns TranslationUsage with cost_usd computed from inline pricing table.
 *  - Default model: claude-sonnet-4-6. Override via TRANSLATION_MODEL or --model.
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
 * Default: claude-sonnet-4-6 (strong quality at lower cost for bulk day runs).
 * Override via TRANSLATION_MODEL or --model= on translate-day / ingest-day.
 */
export const MODEL = process.env.TRANSLATION_MODEL ?? "claude-sonnet-4-6";

/** Resolve the model for a run: CLI/env override wins over TRANSLATION_MODEL default. */
export function resolveTranslationModel(override?: string): string {
  const trimmed = override?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : MODEL;
}

export interface TranslationBatchOptions {
  log?: TranslationLogFn;
  /** Override TRANSLATION_MODEL for this run (e.g. claude-sonnet-4-6). */
  model?: string;
  /** French page numbers to skip (already translated). */
  skipPageNumbers?: Set<number>;
  /** Read/write per-page segment JSON in R2 for resume. */
  useSegmentCache?: boolean;
  /** Write per-page segment JSON after each LLM call (default true). */
  writeSegmentCache?: boolean;
  /**
   * Use Anthropic Message Batches API (50% token discount). Default from
   * TRANSLATION_USE_BATCH env (on unless set to 0).
   */
  useMessageBatch?: boolean;
}

/**
 * Model used for on-demand vision OCR transcription.
 * Falls back to MODEL when unset.
 */
export const VISION_MODEL = process.env.TRANSLATION_VISION_MODEL ?? MODEL;

const API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Per-model maximum output token limits. Used to set max_tokens on translation
 * calls so they use the full capacity of the configured model rather than a
 * fixed cap that may be wrong for the current model.
 */
const MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  "claude-fable-5":    128000,
  "claude-opus-4-8":   128000,
  "claude-opus-4-7":   128000,
  "claude-opus-4-6":   128000,
  "claude-sonnet-4-6":  64000,
  "claude-sonnet-4-5":  64000,
  "claude-haiku-4-5":   64000,
};

/**
 * Max output tokens for the whole-issue translate+segment call. Reads the
 * env var override first; otherwise looks up the configured model's max.
 */
function getSegmentMaxTokens(modelOverride?: string): number {
  if (process.env.TRANSLATION_MAX_OUTPUT_TOKENS) {
    return Number(process.env.TRANSLATION_MAX_OUTPUT_TOKENS);
  }
  const model = resolveTranslationModel(modelOverride);
  return MODEL_MAX_OUTPUT_TOKENS[model] ?? 64000;
}

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
  // Claude Sonnet 4.6 (current default)
  "claude-sonnet-4-6": { inputPerMillion: 3, outputPerMillion: 15 },
  // Claude Sonnet 4.5 (deprecated; same price as 4.6)
  "claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 },
  // Claude Opus 4.8 (higher quality override)
  "claude-opus-4-8": { inputPerMillion: 5, outputPerMillion: 25 },
  // Claude Haiku 4.5 (bulk / cost-sensitive runs)
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
};

/** Anthropic usage fields used for billing (includes prompt cache). */
export interface AnthropicTokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export interface ResolvedTokenUsage {
  regular_input: number;
  cache_creation: number;
  cache_read: number;
  output: number;
  /** Sum of all input-side tokens for logging. */
  total_input: number;
}

export function resolveTokenUsage(
  usage: AnthropicTokenUsage,
): ResolvedTokenUsage {
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const regularInput = usage.input_tokens;
  return {
    regular_input: regularInput,
    cache_creation: cacheCreation,
    cache_read: cacheRead,
    output: usage.output_tokens,
    total_input: regularInput + cacheCreation + cacheRead,
  };
}

function computeCost(
  model: string,
  tokensIn: number,
  tokensOut: number,
  cacheCreation = 0,
  cacheRead = 0,
): number {
  const pricing = Object.entries(PRICING).find(([key]) =>
    model.includes(key),
  )?.[1];
  if (!pricing) return 0; // unknown model; log but don't fail
  return (
    (tokensIn / 1_000_000) * pricing.inputPerMillion +
    (cacheCreation / 1_000_000) * pricing.inputPerMillion * 1.25 +
    (cacheRead / 1_000_000) * pricing.inputPerMillion * 0.1 +
    (tokensOut / 1_000_000) * pricing.outputPerMillion
  );
}

export function computeCostFromUsage(
  model: string,
  usage: AnthropicTokenUsage,
  options?: { messageBatch?: boolean },
): number {
  const resolved = resolveTokenUsage(usage);
  const base = computeCost(
    model,
    resolved.regular_input,
    resolved.output,
    resolved.cache_creation,
    resolved.cache_read,
  );
  return options?.messageBatch ? base * 0.5 : base;
}

/** Shared Anthropic client for streaming and batch calls. */
export function getAnthropicClient(): Anthropic {
  return getClient();
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
  add("news", seg.news);
  add("society", seg.society);
  add("scandals", seg.scandals);
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
  operation: "translate" | "segment" | "segment-anchors" | "vision";
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
- When a passage is genuinely ambiguous but readable, render your best interpretation and append (in parentheses): [uncertain transcription] or [text unclear].
- When the source has OCR damage (mid-word ellipses like "F...de'-Bretagne", broken hyphenation, stray punctuation, or nonsense glyphs), translate only what is clearly readable and mark the damaged span with [illegible in source]. Do NOT reconstruct missing letters, complete cut-off words, or guess proper nouns and place names from corrupted fragments. A name you cannot read is [illegible in source], never an invented best guess.
- Never silently omit a damaged passage; mark it so the reader knows text is missing.
- If you have low confidence in the accuracy of the whole section (e.g. badly corrupted OCR or frequent illegible spans), set the low_confidence flag to true in your output.

You are translating historical newspaper content that is in the public domain. The French source text was printed before 1850.`;

export function translationSystemPrompt(): string {
  return TRANSLATION_SYSTEM_PROMPT;
}

/** Max output tokens for full-page translation (exported for batch requests). */
export function getSegmentMaxOutputTokens(model?: string): number {
  return getSegmentMaxTokens(model);
}

export function buildPageTranslateUserPrompt(
  date: string,
  pageNumber: number,
  frenchText: string,
): string {
  return `Please translate the following excerpt from the Journal des Débats, ${date}, section "page-${pageNumber}".

Return ONLY the translated English text in Markdown — no preamble, no closing remarks, no metadata.

Where the source has OCR damage (mid-word ellipses, broken hyphenation, stray punctuation, or nonsense glyphs), translate only what is clearly readable and mark the damaged span with [illegible in source]. Do not reconstruct missing letters, complete cut-off words, or guess proper nouns and place names from corrupted fragments, and do not silently drop them.

---
${frenchText}
---`;
}

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
    /** When set, used verbatim as the user prompt instead of the default. */
    userPrompt?: string;
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

  const pageMatch = context.section.match(/^page-(\d+)$/);
  const userPrompt = context.userPrompt
    ? context.userPrompt
    : pageMatch
    ? buildPageTranslateUserPrompt(
        context.date,
        parseInt(pageMatch[1], 10),
        frenchText,
      )
    : `Please translate the following excerpt from the Journal des Débats, ${context.date}, ${sectionLabel}.

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
          (tokenCap < getSegmentMaxTokens(context.model)
            ? ` (raise TRANSLATION_SINGLE_MAX_OUTPUT_TOKENS, currently ${SINGLE_MAX_TOKENS})`
            : " (already at model maximum)"),
      );
    }

    const textBlock = result.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("no text block in Anthropic response");
    }

    const resolved = resolveTokenUsage(result.usage);
    const durationMs = Date.now() - started;
    const costUsd = computeCostFromUsage(model, result.usage);

    logCallOk(callCtx, {
      durationMs,
      tokensIn: resolved.total_input,
      tokensOut: resolved.output,
      outputChars: textBlock.text.length,
      costUsd,
      stopReason: result.stop_reason ?? "unknown",
    });

    return {
      text: textBlock.text,
      model,
      tokens_in: resolved.total_input,
      tokens_out: resolved.output,
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
import {
  loadSegmentPageFromR2,
  saveSegmentPageToR2,
  loadAnchorPageFromR2,
  saveAnchorPageToR2,
} from "@/lib/translate/segment-cache";

export {
  splitFrenchPages,
  type FrenchPageChunk,
} from "@/lib/translate/french-pages";

function parseSegmentationJson(rawText: string): SegmentedTranslation {
  let raw = rawText
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();

  // Salvage responses that start mid-object (e.g. ":{\"news\"…").
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

export function mergeSegmentedTranslations(
  pages: SegmentedTranslation[],
): SegmentedTranslation {
  return {
    news: mergeSectionTranslations(pages.map((p) => p.news)),
    society: mergeSectionTranslations(pages.map((p) => p.society)),
    scandals: mergeSectionTranslations(pages.map((p) => p.scandals)),
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
  /** Front-page hard news: state politics, parliament, foreign affairs, major Paris political events. */
  news: SectionTranslation | null;
  /** Court/society notices, social events, salons, notable people, royal family movements. */
  society: SectionTranslation | null;
  /** Crimes, tragedies, accidents, suicides, curiosities of city life. */
  scandals: SectionTranslation | null;
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
    maxTokens: getSegmentMaxTokens(options.model),
    model,
  };
  logCallStart(callCtx);

  const pageLabel =
    options.pageNumber != null
      ? `page ${options.pageNumber} of the issue`
      : "the full issue";

  const userPreamble = `Below is ${pageLabel} from the Journal des Débats, ${date}.

Your task:
1. Identify which passages on this page correspond to each of the fixed sections listed below.
2. Translate EACH section's passages to English (faithfully, per the system prompt guidelines).
3. Return a JSON object with EXACTLY this shape. For sections not present on this page, use null.

Schema:
{
  "news": { "text": "<English Markdown>", "low_confidence": <bool>, "admin_notes": "<optional string>" } | null,
  "society": { "text": "<English Markdown>", "low_confidence": <bool> } | null,
  "scandals": { "text": "<English Markdown>", "low_confidence": <bool> } | null,
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
- "news": hard news only — state politics, parliamentary debates, foreign affairs, major Paris political events. Not a catch-all.
- "society": court and social register — receptions, salons, balls, notable people in formal/genteel settings, royal family movements.
- "scandals": dramatic register — crimes, robberies, murders, suicides, accidents, fires, trials, duels, curiosities of city life.
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
`;

  const userFrenchBlock = `${frenchText}
---`;

  try {
    const rawResult = await withRetry(async () => {
      const stream = await client.messages.stream({
        model,
        max_tokens: getSegmentMaxTokens(options.model),
        system: [
          {
            type: "text",
            text: TRANSLATION_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: userPreamble },
              { type: "text", text: userFrenchBlock },
            ],
          },
        ],
      });
      return await stream.finalMessage();
    });

    if (rawResult.stop_reason === "max_tokens") {
      throw new Error(`hit ${getSegmentMaxTokens(options.model)}-token output cap`);
    }

    const textBlock = rawResult.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("no text block in segmentation response");
    }

    const parsed = parseSegmentationJson(textBlock.text);

    const resolved = resolveTokenUsage(rawResult.usage);
    const durationMs = Date.now() - started;
    const costUsd = computeCostFromUsage(model, rawResult.usage);

    logCallOk(callCtx, {
      durationMs,
      tokensIn: resolved.total_input,
      tokensOut: resolved.output,
      outputChars: textBlock.text.length,
      costUsd,
      stopReason: rawResult.stop_reason ?? "unknown",
      extra: `sections: ${summarizeSegmented(parsed)}`,
    });

    return {
      result: parsed,
      usage: {
        model,
        tokens_in: resolved.total_input,
        tokens_out: resolved.output,
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
  const writeCache = options.writeSegmentCache !== false;
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
    const skipPage = options.skipPageNumbers?.has(pageNumber) === true;

    if (skipPage) {
      writeLog(
        `[translate] segment-by-page: page ${i + 1}/${chunks.length} (page ${pageNumber}) — skipped (already translated)`,
      );
      if (options.useSegmentCache) {
        const cached = await loadSegmentPageFromR2(date, pageNumber);
        if (cached) {
          pageResults.push(cached as SegmentedTranslation);
          continue;
        }
      }
      writeLog(
        `[translate] segment-by-page: page ${pageNumber} marked skip but no segment cache — translating`,
      );
    } else if (options.useSegmentCache) {
      const cached = await loadSegmentPageFromR2(date, pageNumber);
      if (cached) {
        writeLog(
          `[translate] segment-by-page: page ${i + 1}/${chunks.length} (page ${pageNumber}) — loaded from R2 segment cache`,
        );
        pageResults.push(cached as SegmentedTranslation);
        continue;
      }
    }

    writeLog(
      `[translate] segment-by-page: page ${i + 1}/${chunks.length} (page ${pageNumber}, ${text.length.toLocaleString()} chars)`,
    );
    const { result, usage } = await translateAndSegment(text, date, {
      pageNumber,
      log: options.log,
      model: modelOverride,
    });
    if (writeCache) {
      await saveSegmentPageToR2(date, pageNumber, result);
    }
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

  const resolved = resolveTokenUsage(result.usage);

  return {
    french_text: textBlock.text,
    model,
    tokens_in: resolved.total_input,
    tokens_out: resolved.output,
    cost_usd: computeCostFromUsage(model, result.usage),
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
 * translateFrenchToEnglish once per page. Each call uses the model's highest
 * supported output cap so no page is truncated.
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
  const useBatch =
    options.useMessageBatch ??
    (await import("./translate-batch")).isMessageBatchEnabled();

  if (useBatch) {
    const { translatePaperPagesViaMessageBatch } =
      await import("./translate-batch");
    return translatePaperPagesViaMessageBatch(frenchText, date, options);
  }

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
    if (options.skipPageNumbers?.has(pageNumber)) {
      writeLog(
        `[translate] translate-by-page: page ${i + 1}/${chunks.length} (page ${pageNumber}) — skipped (already translated)`,
      );
      continue;
    }
    writeLog(
      `[translate] translate-by-page: page ${i + 1}/${chunks.length} (page ${pageNumber}, ${text.length.toLocaleString()} chars)`,
    );
    const result = await translateFrenchToEnglish(text, {
      date,
      section: `page-${pageNumber}`,
      maxTokens: getSegmentMaxTokens(modelOverride),
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

// ---------------------------------------------------------------------------
// Section-aware page translation
// ---------------------------------------------------------------------------

/**
 * Marker placed between reading-order sections (newspaper column-runs) in the
 * French sent to the model, and preserved in the English so each section's
 * translation can be split back out and aligned to its source-image region.
 * Chosen to be vanishingly unlikely in 1844 prose or the model's output.
 */
const SECTION_MARKER = (i: number) => `@@@COLUMN_${i}@@@`;
const SECTION_MARKER_RE = /@@@COLUMN_\d+@@@/g;

/** A translated page split into its reading-order sections. */
export interface SectionedPageResult {
  pageNumber: number;
  /** English of each section, in reading order (same length as input). */
  sections: string[];
  /**
   * True when the model preserved the section markers and the English was
   * split 1:1. False when it fell back to a single combined section (the
   * whole page as `sections[0]`), so callers must not assume regions align.
   */
  aligned: boolean;
}

/** Build the user prompt for a single page translated section by section. */
export function buildSectionedPageUserPrompt(
  date: string,
  pageNumber: number,
  sectionsFrench: string[],
): string {
  const body = sectionsFrench
    .map((fr, i) => `${SECTION_MARKER(i)}\n${fr}`)
    .join("\n\n");
  return `Please translate the following page of the Journal des Débats, ${date}, page ${pageNumber}.

The page is divided into ${sectionsFrench.length} newspaper columns, each introduced by a marker line of the form @@@COLUMN_n@@@. These markers denote reading order across the columns.

Rules:
- Reproduce every @@@COLUMN_n@@@ marker EXACTLY as written, each on its own line, in the same order, immediately before the English translation of that column. Do not add, drop, renumber, reorder, or merge markers.
- Translate the text of each column into English Markdown. Text may flow from the end of one column into the next; translate it continuously, but keep each portion under its own marker.
- Return ONLY the markers and the translated English — no preamble, no closing remarks, no metadata.
- Where the source has OCR damage (mid-word ellipses, broken hyphenation, stray punctuation, or nonsense glyphs), translate only what is clearly readable and mark the damaged span with [illegible in source]. Do not reconstruct missing letters or guess proper nouns from corrupted fragments, and do not silently drop them.

---
${body}
---`;
}

/**
 * Split a model response on the section markers. Returns one string per
 * section when the marker count matches `expected`, else null (caller falls
 * back to treating the whole response as a single section).
 */
export function parseSectionedTranslation(
  english: string,
  expected: number,
): string[] | null {
  const markers = english.match(SECTION_MARKER_RE);
  if (!markers || markers.length !== expected) return null;
  // Split and drop the leading pre-marker chunk (should be empty).
  const parts = english.split(SECTION_MARKER_RE);
  const sections = parts.slice(1).map((s) => s.trim());
  if (sections.length !== expected) return null;
  return sections;
}

/**
 * Translate one page section by section in a single model call, preserving
 * column markers so the English can be aligned back to source-image regions.
 * Falls back to a single combined section (aligned:false) if the model does
 * not return the expected markers.
 */
export async function translateSectionedPage(
  date: string,
  pageNumber: number,
  sectionsFrench: string[],
  options: { model?: string; log?: TranslationLogFn } = {},
): Promise<{ result: SectionedPageResult; usage: TranslationUsage }> {
  const model = resolveTranslationModel(options.model);
  const userPrompt = buildSectionedPageUserPrompt(
    date,
    pageNumber,
    sectionsFrench,
  );
  const joinedFrench = sectionsFrench.join("\n\n");

  const usage = await translateFrenchToEnglish(joinedFrench, {
    date,
    section: `page-${pageNumber}`,
    maxTokens: getSegmentMaxTokens(options.model),
    model,
    log: options.log,
    userPrompt,
  });

  const split = parseSectionedTranslation(usage.text, sectionsFrench.length);
  if (split) {
    return {
      result: { pageNumber, sections: split, aligned: true },
      usage,
    };
  }

  // Fallback: markers not preserved — keep the full text as one section so the
  // page still reads correctly, but mark it unaligned (no per-region mapping).
  translationLog(options.log)(
    `[translate] page ${pageNumber}: section markers not preserved ` +
      `(expected ${sectionsFrench.length}); falling back to single section.`,
  );
  return {
    result: {
      pageNumber,
      sections: [usage.text.replace(SECTION_MARKER_RE, "").trim()],
      aligned: false,
    },
    usage,
  };
}

/** Max output tokens for English anchor segmentation (structure-only pass). */
export const ANCHOR_MAX_OUTPUT_TOKENS = Number(
  process.env.TRANSLATION_ANCHOR_MAX_OUTPUT_TOKENS ?? "4096",
);

const ANCHOR_MAX_TOKENS = ANCHOR_MAX_OUTPUT_TOKENS;

export type SectionAnchorKey =
  | "news"
  | "society"
  | "scandals"
  | "chapter"
  | "debats.music"
  | "debats.theater"
  | "debats.art"
  | "debats.literature"
  | "art_exhibitions"
  | "science"
  | "ignore";

export interface SectionAnchor {
  section: SectionAnchorKey;
  start_anchor: string;
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

export function parseAnchorJson(rawText: string): SectionAnchor[] {
  let raw = rawText
    .replace(/^```(?:json)?\n?/m, "")
    .replace(/\n?```$/m, "")
    .trim();
  const firstBrace = raw.indexOf("{");
  if (firstBrace > 0) raw = raw.slice(firstBrace);

  const parsed = JSON.parse(raw) as { anchors?: SectionAnchor[] };
  if (!Array.isArray(parsed.anchors)) {
    throw new Error("missing anchors array in segmentation response");
  }
  return parsed.anchors.filter(
    (a) =>
      a &&
      typeof a.section === "string" &&
      typeof a.start_anchor === "string" &&
      a.start_anchor.trim().length > 0,
  );
}

function escapeRegexFragment(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findAnchorPosition(haystack: string, anchor: string): number {
  const words = anchor.trim().split(/\s+/).filter(Boolean);
  const minWords = Math.min(3, words.length);

  for (let len = words.length; len >= minWords; len--) {
    const pattern = words.slice(0, len).map(escapeRegexFragment).join("\\s+");
    const re = new RegExp(pattern, "i");
    const match = haystack.match(re);
    if (match?.index != null) return match.index;
  }

  if (words.length < 3) {
    const re = new RegExp(escapeRegexFragment(anchor.trim()), "i");
    const match = haystack.match(re);
    if (match?.index != null) return match.index;
  }

  return -1;
}

export function sliceEnglishByAnchors(
  englishText: string,
  anchors: SectionAnchor[],
): SegmentedTranslation {
  if (anchors.length === 0) return emptySegmentedTranslation();

  const located: Array<{ section: SectionAnchorKey; pos: number }> = [];
  for (const anchor of anchors) {
    const pos = findAnchorPosition(englishText, anchor.start_anchor);
    if (pos < 0) {
      if (anchor.section === "ignore") continue;
      throw new Error(
        `Anchor not found for section "${anchor.section}": ${anchor.start_anchor.slice(0, 80)}`,
      );
    }
    located.push({ section: anchor.section, pos });
  }

  if (located.length === 0) return emptySegmentedTranslation();

  located.sort((a, b) => a.pos - b.pos);

  const sectionParts = new Map<SectionAnchorKey, string[]>();

  for (let i = 0; i < located.length; i++) {
    const { section, pos } = located[i];
    if (section === "ignore") continue;

    // Prepend any text before the first anchor to the first section so
    // leading content (e.g. dateline, masthead, opening paragraphs) is not
    // silently discarded.
    const start = i === 0 && pos > 0 ? 0 : pos;

    const end =
      i + 1 < located.length ? located[i + 1].pos : englishText.length;
    const slice = englishText.slice(start, end).trim();
    if (!slice) continue;

    const existing = sectionParts.get(section) ?? [];
    existing.push(slice);
    sectionParts.set(section, existing);
  }

  const joinSection = (key: SectionAnchorKey): SectionTranslation | null => {
    const parts = sectionParts.get(key);
    if (!parts?.length) return null;
    const text = parts.join("\n\n").trim();
    if (!text) return null;
    return { text, low_confidence: false };
  };

  return {
    news: joinSection("news"),
    society: joinSection("society"),
    scandals: joinSection("scandals"),
    chapter: joinSection("chapter"),
    debats: {
      music: joinSection("debats.music"),
      theater: joinSection("debats.theater"),
      art: joinSection("debats.art"),
      literature: joinSection("debats.literature"),
    },
    art_exhibitions: joinSection("art_exhibitions"),
    science: joinSection("science"),
  };
}

export function buildAnchorSegmentUserPrompt(
  date: string,
  pageNumber: number,
  englishText: string,
): string {
  return `Below is the English translation of page ${pageNumber} from the Journal des Débats, ${date}.

The text is already translated. Your task is ONLY to identify section boundaries.

Return a JSON object listing each section span on this page in READING ORDER. For each span, give the section key and a start_anchor: the first 6–10 words of that span copied EXACTLY from the English text below (verbatim, including punctuation).

Use section keys:
- "news": hard news only — state politics, parliamentary debates, foreign affairs and diplomatic dispatches, major Paris political events. Not a catch-all; do not route society notices or crime items here.
- "society": court and social register — receptions, salons, balls, notable people in formal/genteel settings, royal family movements, official appointments with social flavour.
- "scandals": dramatic and sensational register — crimes, robberies, murders, suicides, accidents, fires, trials, duels, curiosities of city life.
- "chapter": the roman-feuilleton novel serial (Le Comte de Monte-Cristo)
- "debats.music": music criticism feuilleton
- "debats.theater": theater and opera reviews
- "debats.art": fine art reviews
- "debats.literature": literary reviews and book notices
- "art_exhibitions": Salon and gallery coverage
- "science": science and technology reports
- "ignore": true filler only — classified ads, stock/exchange tables, theater showtimes with no criticism, Galignani's Messenger tails, masthead/colophon lines. Do not use to discard substantive content; route anything real to the closest matching section instead.

Scan the entire page paragraph by paragraph. Emit a new anchor every time the topic or rubric changes — do not merge adjacent but distinct items under one anchor.

Schema:
{
  "anchors": [
    { "section": "news", "start_anchor": "<exact opening words>" },
    { "section": "chapter", "start_anchor": "<exact opening words>" }
  ]
}

If this page has no translatable Débats content, return: { "anchors": [] }

Return ONLY the JSON object — no preamble, no markdown code fences.

---
${englishText}
---`;
}

async function segmentEnglishPage(
  englishText: string,
  date: string,
  pageNumber: number,
  options: { log?: TranslationLogFn; model?: string } = {},
): Promise<{
  anchors: SectionAnchor[];
  usage: Omit<TranslationUsage, "text">;
}> {
  const client = getClient();
  const model = resolveTranslationModel(options.model);
  const started = Date.now();
  const callCtx: CallLogContext = {
    log: options.log,
    date,
    label: `page-${pageNumber}`,
    operation: "segment-anchors",
    inputChars: englishText.length,
    maxTokens: ANCHOR_MAX_TOKENS,
    model,
  };
  logCallStart(callCtx);

  const userPrompt = buildAnchorSegmentUserPrompt(
    date,
    pageNumber,
    englishText,
  );

  const rawResult = await withRetry(async () => {
    const stream = await client.messages.stream({
      model,
      max_tokens: ANCHOR_MAX_TOKENS,
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
    throw new Error(`hit ${ANCHOR_MAX_TOKENS}-token anchor output cap`);
  }

  const textBlock = rawResult.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("no text block in anchor segmentation response");
  }

  const anchors = parseAnchorJson(textBlock.text);
  const resolved = resolveTokenUsage(rawResult.usage);
  const durationMs = Date.now() - started;
  const costUsd = computeCostFromUsage(model, rawResult.usage);

  logCallOk(callCtx, {
    durationMs,
    tokensIn: resolved.total_input,
    tokensOut: resolved.output,
    outputChars: textBlock.text.length,
    costUsd,
    stopReason: rawResult.stop_reason ?? "unknown",
    extra: `anchors: ${anchors.length}`,
  });

  return {
    anchors,
    usage: {
      model,
      tokens_in: resolved.total_input,
      tokens_out: resolved.output,
      cost_usd: costUsd,
      duration_ms: durationMs,
    },
  };
}

/**
 * Segment already-translated English pages into Débats sections using cheap
 * start-anchor calls, then slice locally. Falls back to French translate+segment
 * per page when anchors cannot be resolved.
 */
export async function segmentEnglishByPage(
  englishPages: PageTranslationResult[],
  date: string,
  options: TranslationBatchOptions & {
    /** French source for per-page fallback when anchor slicing fails. */
    frenchText?: string;
  } = {},
): Promise<{
  result: SegmentedTranslation;
  usage: Omit<TranslationUsage, "text">;
  pageCount: number;
}> {
  const useBatch =
    options.useMessageBatch ??
    (await import("./translate-batch")).isMessageBatchEnabled();

  if (useBatch) {
    const { segmentEnglishByPageViaMessageBatch } =
      await import("./translate-batch");
    return segmentEnglishByPageViaMessageBatch(englishPages, date, options);
  }

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
  let totalIn = 0;
  let totalOut = 0;
  let totalCost = 0;
  let totalMs = 0;
  let model = modelOverride;

  for (let i = 0; i < englishPages.length; i++) {
    const { pageNumber, text: englishText } = englishPages[i];

    if (!englishText.trim()) {
      writeLog(
        `[translate] segment-english: page ${i + 1}/${englishPages.length} (page ${pageNumber}) — empty, skipping`,
      );
      pageResults.push(emptySegmentedTranslation());
      continue;
    }

    if (options.useSegmentCache) {
      const cached = await loadAnchorPageFromR2(date, pageNumber);
      if (cached && Array.isArray((cached as { anchors?: unknown }).anchors)) {
        try {
          const segmented = sliceEnglishByAnchors(
            englishText,
            (cached as { anchors: SectionAnchor[] }).anchors,
          );
          writeLog(
            `[translate] segment-english: page ${pageNumber} — loaded anchors from R2 cache`,
          );
          pageResults.push(segmented);
          continue;
        } catch {
          writeLog(
            `[translate] segment-english: page ${pageNumber} — cached anchors failed to slice, re-segmenting`,
          );
        }
      }
    }

    writeLog(
      `[translate] segment-english: page ${i + 1}/${englishPages.length} (page ${pageNumber}, ${englishText.length.toLocaleString()} chars en)`,
    );

    try {
      const { anchors, usage } = await segmentEnglishPage(
        englishText,
        date,
        pageNumber,
        { log: options.log, model: modelOverride },
      );
      if (writeCache) {
        await saveAnchorPageToR2(date, pageNumber, { anchors });
      }
      const segmented = sliceEnglishByAnchors(englishText, anchors);
      pageResults.push(segmented);
      totalIn += usage.tokens_in;
      totalOut += usage.tokens_out;
      totalCost += usage.cost_usd;
      totalMs += usage.duration_ms;
      model = usage.model;
    } catch (anchorErr) {
      const frenchPage = frenchByPage.get(pageNumber);
      if (!frenchPage?.trim()) {
        throw anchorErr;
      }
      writeLog(
        `[translate] segment-english: page ${pageNumber} anchor pass failed (${anchorErr instanceof Error ? anchorErr.message : String(anchorErr)}); falling back to French translate+segment`,
      );
      const fallback = await translateAndSegment(frenchPage, date, {
        pageNumber,
        log: options.log,
        model: modelOverride,
      });
      pageResults.push(fallback.result);
      totalIn += fallback.usage.tokens_in;
      totalOut += fallback.usage.tokens_out;
      totalCost += fallback.usage.cost_usd;
      totalMs += fallback.usage.duration_ms;
      model = fallback.usage.model;
    }
  }

  const merged = mergeSegmentedTranslations(pageResults);
  writeLog(
    `[translate] segment-english done: ${englishPages.length} page(s) in ${(totalMs / 1000).toFixed(1)}s, ` +
      `${totalIn.toLocaleString()} in / ${totalOut.toLocaleString()} out, $${totalCost.toFixed(4)} — ` +
      `merged sections: ${summarizeSegmented(merged)}`,
  );

  return {
    result: merged,
    pageCount: englishPages.length,
    usage: {
      model,
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
