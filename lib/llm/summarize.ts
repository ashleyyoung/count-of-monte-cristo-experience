/**
 * lib/llm/summarize.ts
 *
 * Anthropic entry point for the summarize-day pipeline. Reads already-translated
 * English pages and produces an immersive highlights briefing for doc.overview.
 */

import Anthropic, {
  RateLimitError,
  InternalServerError,
  APIConnectionError,
  APIConnectionTimeoutError,
} from "@anthropic-ai/sdk";
import {
  resolveTranslationModel,
  type TranslationLogFn,
  type TranslationUsage,
} from "./translate";
import {
  parseParisOverview,
  type ParisOverview,
} from "../types/paris-overview";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_KEY = process.env.ANTHROPIC_API_KEY;

const SUMMARIZE_MAX_TOKENS = Number(
  process.env.SUMMARIZE_MAX_OUTPUT_TOKENS ?? "1200",
);

// ---------------------------------------------------------------------------
// Pricing (mirrors lib/llm/translate.ts)
// ---------------------------------------------------------------------------

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-fable-5": { inputPerMillion: 10, outputPerMillion: 50 },
  "claude-sonnet-4-6": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-sonnet-4-5": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-opus-4-8": { inputPerMillion: 5, outputPerMillion: 25 },
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
  if (!pricing) return 0;
  return (
    (tokensIn / 1_000_000) * pricing.inputPerMillion +
    (tokensOut / 1_000_000) * pricing.outputPerMillion
  );
}

// ---------------------------------------------------------------------------
// Client + retry
// ---------------------------------------------------------------------------

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is required for the summarize pipeline. Set it in your environment.",
    );
  }
  if (!_client) {
    _client = new Anthropic({ apiKey: API_KEY, maxRetries: 0 });
  }
  return _client;
}

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
          `[summarize] Transient error (attempt ${attempt}/${MAX_ATTEMPTS}): ${
            (err as Error).message
          }. Retrying in ${Math.round(delay)}ms…`,
        );
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
  throw new Error("[summarize] Retry loop exhausted");
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const SUMMARIZE_SYSTEM_PROMPT = `You are an editorial curator preparing the Overview tab for a modern reader of the
Journal des Débats (Paris, 1844–46).

You will receive translated newspaper sections for one issue. Output a single JSON
object only — no markdown wrapper, no commentary before or after.

Schema (strict):
{
  "version": 2,
  "lead": "<one sentence>",
  "highlights": [
    { "text": "<one sentence>", "section": "<section id>" }
  ]
}

Section ids:
- "news" — News & Politics
- "society" — Society
- "scandals" — Scandals & Curiosities
- "arts" — Arts (Art & Letters and Art & Exhibitions combined)
- "literature" — Literature
- "science" — Science
- "music" — Music
- "theatre" — Theatre

Rules for "lead":
1. One short sentence (max ~25 words) naming the 2–3 most prominent topics in this issue.
2. Concrete nouns only — name the subjects (Morocco, a murder trial, the Academy of Sciences).
   Do not describe the issue's mood, energy, spirit, or character. Do not use metaphors.
3. No adjectives that editorialize ("dramatic", "restless", "vivid"). Plain declarative prose.

Rules for "highlights":
1. 5–8 entries total. Each is a completely distinct story or fact.
   No two items may describe the same event — not even from different angles.
2. "text": one vivid sentence per entry (max ~35 words). Name names, give numbers.
   Write for a curious modern reader. Prefer the surprising, striking, or unusual.
3. "section": the section id the item came from. Required — never omit.
4. Include at least one item for every section with substantive content in the source.
5. Skip routine items: stock prices, horse-racing, routine appointments, weather.
6. Do not include feuilleton or Monte-Cristo chapter content — that lives elsewhere.
7. Preserve *italics* for newspaper and work titles.

Output valid JSON only.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SummarizePageInput {
  pageNumber: number;
  text: string;
}

export interface SummarizeSectionInput {
  label: string;
  text: string;
}

export interface SummarizeInstallmentContext {
  label: string;
  part: number;
  part_index: number;
  chapterLabel: string;
}

export interface SummarizeOptions {
  model?: string;
  log?: TranslationLogFn;
}

function buildPagesUserPrompt(
  date: string,
  installment: SummarizeInstallmentContext,
  pages: SummarizePageInput[],
): string {
  const pageBlocks = pages
    .map((p) => `--- Page ${p.pageNumber} ---\n${p.text.trim()}`)
    .join("\n\n");

  return `Journal des Débats, ${date}.
Installment: ${installment.label} — ${installment.chapterLabel} (Part ${installment.part}, installment ${installment.part_index}).

Below are the translated pages of this issue. Output the JSON overview object described
in your instructions.

${pageBlocks}`;
}

function buildSectionsUserPrompt(
  date: string,
  installment: SummarizeInstallmentContext,
  sections: SummarizeSectionInput[],
): string {
  const sectionBlocks = sections
    .map((s) => `--- ${s.label} ---\n${s.text.trim()}`)
    .join("\n\n");

  return `Journal des Débats, ${date}.
Installment: ${installment.label} — ${installment.chapterLabel} (Part ${installment.part}, installment ${installment.part_index}).

Below are the translated newspaper sections for this issue. Output the JSON overview
object described in your instructions.

${sectionBlocks}`;
}

async function callSummarizeApi(
  userPrompt: string,
  date: string,
  options: SummarizeOptions | undefined,
): Promise<TranslationUsage & { overview: ParisOverview }> {
  const client = getClient();
  const model = resolveTranslationModel(options?.model);
  const log = options?.log ?? ((msg) => console.error(msg));
  const started = Date.now();

  log(
    `[summarize] → ${date}: sending ${userPrompt.length.toLocaleString()} chars ` +
      `(max_output=${SUMMARIZE_MAX_TOKENS.toLocaleString()}, model=${model})`,
  );

  try {
    const result = await withRetry(async () => {
      const stream = await client.messages.stream({
        model,
        max_tokens: SUMMARIZE_MAX_TOKENS,
        system: [
          {
            type: "text",
            text: SUMMARIZE_SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userPrompt }],
      });
      return await stream.finalMessage();
    });

    if (result.stop_reason === "max_tokens") {
      throw new Error(
        `hit ${SUMMARIZE_MAX_TOKENS}-token output cap (raise SUMMARIZE_MAX_OUTPUT_TOKENS)`,
      );
    }

    const textBlock = result.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("no text block in Anthropic summarize response");
    }

    const overview: ParisOverview | null = parseParisOverview(textBlock.text);
    if (!overview) {
      throw new Error(
        `summarize output is not valid overview JSON. Raw prefix: ${textBlock.text.slice(0, 200)}`,
      );
    }

    const tokensIn = result.usage.input_tokens;
    const tokensOut = result.usage.output_tokens;
    const durationMs = Date.now() - started;
    const costUsd = computeCost(model, tokensIn, tokensOut);

    log(
      `[summarize] ok ${date}: ${(durationMs / 1000).toFixed(1)}s, ` +
        `${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out, ` +
        `${overview.version === 2 ? overview.highlights.length + " highlight(s)" : overview.sections.length + " section(s), " + overview.noteworthy.length + " noteworthy"}, ` +
        `$${costUsd.toFixed(4)}, stop=${result.stop_reason ?? "unknown"}`,
    );

    return {
      text: JSON.stringify(overview, null, 2),
      overview,
      model,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
      duration_ms: durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(
      `[summarize] failed ${date}: ${((Date.now() - started) / 1000).toFixed(1)}s — ${message}`,
    );
    throw err instanceof Error ? err : new Error(message);
  }
}

/**
 * Summarize live translated English pages into a highlights briefing.
 */
export async function summarizeTranslatedPages(
  pages: SummarizePageInput[],
  date: string,
  installment: SummarizeInstallmentContext,
  options?: SummarizeOptions,
): Promise<TranslationUsage> {
  const userPrompt = buildPagesUserPrompt(date, installment, pages);
  return callSummarizeApi(userPrompt, date, options);
}

/**
 * Summarize segmented section texts into a highlights briefing.
 */
export async function summarizeSectionTexts(
  sections: SummarizeSectionInput[],
  date: string,
  installment: SummarizeInstallmentContext,
  options?: SummarizeOptions,
): Promise<TranslationUsage> {
  const userPrompt = buildSectionsUserPrompt(date, installment, sections);
  return callSummarizeApi(userPrompt, date, options);
}
