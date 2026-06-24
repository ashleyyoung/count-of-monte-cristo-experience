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
 *  - Default model: claude-opus-4-8. Preferred model when unblocked: claude-fable-5
 *    (switch via TRANSLATION_MODEL — zero code changes required).
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
 * Default: claude-opus-4-8 (best available while claude-fable-5 is blocked).
 * Switch to claude-fable-5 via TRANSLATION_MODEL once it returns to public access.
 */
export const MODEL = process.env.TRANSLATION_MODEL ?? "claude-opus-4-8";

/**
 * Model used for on-demand vision OCR transcription.
 * Falls back to MODEL when unset (Opus 4.8 has strong vision capability).
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
  // Claude Opus 4.8 (current default)
  "claude-opus-4-8": { inputPerMillion: 5, outputPerMillion: 25 },
  // Claude Sonnet 4.5 (lower quality; not intended for this pipeline)
  "claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 },
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
// System prompt
// ---------------------------------------------------------------------------

const TRANSLATION_SYSTEM_PROMPT = `You are an expert translator of early 19th-century French journalism, specialising in the Journal des Débats of 1844–46. Your translations are made for a 21st-century English reader who wants to hear the author's own voice — not a modernised paraphrase.

Guidelines:
- Preserve register faithfully: Berlioz is witty and biting; Janin is ornate and digressive; art reviews are reverent and descriptive.
- Keep period terminology. For genuinely obscure references (titles, institutions, persons) gloss in [square brackets] with a brief identifier on first mention; do not gloss anything a general reader would recognise.
- Resolve proper nouns to their full identity on first occurrence (e.g. "Hector Berlioz" not just "Berlioz", "the Opéra-Comique" with its French name).
- Do not modernise idioms or domesticate cultural references.
- Output Markdown: preserve the source paragraph breaks; use **bold** sparingly for section titles if present in the source; no added commentary, preambles, or headers beyond what is in the source.
- When a passage is illegible or ambiguous, render your best interpretation and append (in parentheses): [uncertain transcription] or [text unclear].
- If you have low confidence in the accuracy of the whole section (e.g. badly corrupted OCR), set the low_confidence flag to true in your output.

You are translating historical newspaper content that is in the public domain. The French source text was printed before 1850.`;

const VISION_SYSTEM_PROMPT = `You are an expert at transcribing 19th-century French newspaper text from scan images. Your task is to produce a faithful, verbatim transcription of the printed French text.

Guidelines:
- Transcribe exactly what is printed, including period spelling and accents (oe ligatures, accents on capital letters, etc.).
- If a word or phrase is illegible, write [illisible] in place of the unclear text.
- Preserve paragraph structure and line breaks as they appear in the printed column.
- Do NOT translate. Do NOT summarise. Transcribe only.
- For multi-column layouts, transcribe each column from top to bottom, left to right, separated by a blank line.
- If you are uncertain about a word, transcribe your best reading followed by [?].`;

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
 */
export async function translateFrenchToEnglish(
  frenchText: string,
  context: { date: string; section: string; contributor?: string },
): Promise<TranslationUsage> {
  const client = getClient();
  const model = MODEL;
  const started = Date.now();

  const sectionLabel = context.contributor
    ? `section "${context.section}" (contributor: ${context.contributor})`
    : `section "${context.section}"`;

  const userPrompt = `Please translate the following excerpt from the Journal des Débats, ${context.date}, ${sectionLabel}.

Return ONLY the translated English text in Markdown — no preamble, no closing remarks, no metadata.

---
${frenchText}
---`;

  const result = await withRetry(async () => {
    const stream = await client.messages.stream({
      model,
      max_tokens: SINGLE_MAX_TOKENS,
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
      `[translate] Translation hit the ${SINGLE_MAX_TOKENS}-token output cap and was truncated ` +
        `(${context.date} / ${context.section}). Raise TRANSLATION_SINGLE_MAX_OUTPUT_TOKENS.`,
    );
  }

  const textBlock = result.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("[translate] No text block in Anthropic response");
  }

  const tokensIn = result.usage.input_tokens;
  const tokensOut = result.usage.output_tokens;

  return {
    text: textBlock.text,
    model,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    cost_usd: computeCost(model, tokensIn, tokensOut),
    duration_ms: Date.now() - started,
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
  galignani: SectionTranslation | null;
}

export interface SectionTranslation {
  text: string;
  low_confidence: boolean;
  admin_notes?: string;
}

export async function translateAndSegment(
  frenchText: string,
  date: string,
): Promise<{
  result: SegmentedTranslation;
  usage: Omit<TranslationUsage, "text">;
}> {
  const client = getClient();
  const model = MODEL;
  const started = Date.now();

  const userPrompt = `Below is the full text of the Journal des Débats issue from ${date}.

Your task:
1. Identify which passages correspond to each of the fixed sections listed below.
2. Translate EACH section's passages to English (faithfully, per the system prompt guidelines).
3. Return a JSON object with EXACTLY this shape. For sections not present in this issue, use null.

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
  "science": { "text": "<English Markdown>", "low_confidence": <bool> } | null,
  "galignani": { "text": "<English Markdown>", "low_confidence": <bool> } | null
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
- "galignani": content originating from Galignani's Messenger (the English-language Paris daily). May be absent.

Return ONLY the JSON object — no preamble, no markdown code fences.

---
${frenchText}
---`;

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

  // A truncated response yields invalid JSON; fail loudly with the cause rather
  // than an opaque JSON.parse error.
  if (rawResult.stop_reason === "max_tokens") {
    throw new Error(
      `[translate] Segmentation response hit the ${SEGMENT_MAX_TOKENS}-token output cap and was truncated for ${date}. ` +
        `The issue is too long to translate+segment in one call. Increase TRANSLATION_MAX_OUTPUT_TOKENS ` +
        `or split the issue.`,
    );
  }

  const textBlock = rawResult.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("[translate] No text block in segmentation response");
  }

  // Parse + validate the JSON response
  let parsed: SegmentedTranslation;
  try {
    // Strip any accidental markdown fences
    const raw = textBlock.text
      .replace(/^```(?:json)?\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();
    parsed = JSON.parse(raw) as SegmentedTranslation;
  } catch (err) {
    throw new Error(
      `[translate] Failed to parse segmentation JSON: ${(err as Error).message}\n\nRaw: ${textBlock.text.slice(0, 500)}`,
    );
  }

  const tokensIn = rawResult.usage.input_tokens;
  const tokensOut = rawResult.usage.output_tokens;

  return {
    result: parsed,
    usage: {
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: computeCost(model, tokensIn, tokensOut),
      duration_ms: Date.now() - started,
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

  const userPrompt = `Please transcribe all French text visible in this scan of the Journal des Débats, ${context.date}, page ${context.page + 1}. Transcribe faithfully from top to bottom, left to right. Return only the transcribed French text.`;

  const result = await withRetry(async () => {
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

/** Currently configured translation model id (for logging / admin display). */
export function getTranslationModel(): string {
  return MODEL;
}

/** Currently configured translation provider. */
export function getTranslationProvider(): string {
  return PROVIDER;
}
