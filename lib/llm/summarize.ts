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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_KEY = process.env.ANTHROPIC_API_KEY;

const SUMMARIZE_MAX_TOKENS = Number(
  process.env.SUMMARIZE_MAX_OUTPUT_TOKENS ?? "2000",
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

export const SUMMARIZE_SYSTEM_PROMPT = `You are an editorial curator preparing a daily briefing for a modern reader of the
Journal des Débats, a Paris political and cultural newspaper published in 1844–46.

Your job is to write a short highlights passage — roughly 350 to 450 words — that
makes the reader feel they have opened this particular issue and understood what
matters in it and why. This is not a list of headlines. It is a connected piece of
prose that gives the reader a sense of the day.

Rules:

1. Orientation first. Begin with a plain, specific sentence that places the reader in
   the day: what city, what moment, what the paper is dominated by. No mood-setting
   or scene-painting.

2. Find the through-line. Most issues have a connective thread — a diplomatic
   situation, a military campaign, a long-running controversy — that ties several
   items together. Use it. Relate items to each other rather than listing them as
   disconnected briefs.

3. Stakes and context. For each major item, supply the one sentence of background a
   21st-century reader needs to follow it: who a figure is, why a conflict matters,
   what an institution does. Draw only on general historical knowledge. Do not invent
   any detail not in the source.

4. The feuilleton, told straight. Give the day's installment of The Count of
   Monte-Cristo real space. Recount the scene plainly — what happens, who is present,
   what shifts. Do not editorialize about the novel's importance or future reputation.

5. Scan beyond the front page. Pages 2 through 4 carry court reports, provincial
   dispatches, criminal cases, accidents, and legal notices that illuminate daily life
   more vividly than most front-page politics. Look for: striking criminal cases or
   verdicts, unusual deaths or incidents, curiosities that reveal the texture of the
   period (technology experiments, theatrical debuts, railway oddities, crimes of
   passion). Include at most two such items — only the ones genuinely striking enough
   to make a reader pause. Do not list horse-racing results, stock prices, or
   administrative appointments.

6. Restraint over flourish. Write plainly. Do not use the foreshadowing narrator
   ("little did they know," "what no one yet knew," "a legend was beginning"). Do not
   claim anything about a work's future fame or place in history. Avoid puns,
   rhetorical antitheses, and tidy parallel constructions. Avoid purple prose:
   stacked adjectives, manufactured atmosphere, and sentences that describe a mood
   rather than a fact ("Paris held its breath," "the city trembled," "in the gray
   light of that August morning"). If a sentence sounds like a book-jacket blurb or a
   documentary voiceover, cut it.

7. Style. Commas, semicolons, and periods instead of em-dashes. Say what things are;
   do not describe them by what they are not. No invented facts. No editorial
   commentary on what readers should think. Output clean Markdown; preserve italics
   for publication titles.`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SummarizePageInput {
  pageNumber: number;
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

function buildUserPrompt(
  date: string,
  installment: SummarizeInstallmentContext,
  pages: SummarizePageInput[],
): string {
  const pageBlocks = pages
    .map((p) => `--- Page ${p.pageNumber} ---\n${p.text.trim()}`)
    .join("\n\n");

  return `Journal des Débats, ${date}.
Installment: ${installment.label} — ${installment.chapterLabel} (Part ${installment.part}, installment ${installment.part_index}).

Below are the translated pages of this issue. Write the highlights briefing described
in your instructions.

${pageBlocks}`;
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
  const client = getClient();
  const model = resolveTranslationModel(options?.model);
  const log = options?.log ?? ((msg) => console.error(msg));
  const userPrompt = buildUserPrompt(date, installment, pages);
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

    const tokensIn = result.usage.input_tokens;
    const tokensOut = result.usage.output_tokens;
    const durationMs = Date.now() - started;
    const costUsd = computeCost(model, tokensIn, tokensOut);

    log(
      `[summarize] ok ${date}: ${(durationMs / 1000).toFixed(1)}s, ` +
        `${tokensIn.toLocaleString()} in / ${tokensOut.toLocaleString()} out, ` +
        `${textBlock.text.length.toLocaleString()} chars en, $${costUsd.toFixed(4)}, ` +
        `stop=${result.stop_reason ?? "unknown"}`,
    );

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
    log(
      `[summarize] failed ${date}: ${((Date.now() - started) / 1000).toFixed(1)}s — ${message}`,
    );
    throw err instanceof Error ? err : new Error(message);
  }
}
