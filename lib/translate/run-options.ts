/**
 * lib/translate/run-options.ts
 *
 * Shared RunDayTranslationOptions for every entry point: translate-day.ts,
 * translate-all.ts, ingest-day.ts, and admin server actions.
 */

import type { RunDayTranslationOptions } from "./pipeline";

export const DEFAULT_TRANSLATION_MODEL = "claude-sonnet-4-6";

export interface TranslationRunOptionsInput {
  model?: string;
  /** Re-fetch Gallica French source even when R2 intermediate exists. */
  forceFetch?: boolean;
  /**
   * Redo LLM work even when segment cache / translated_pages already exist.
   * Default false: resume partial runs from cache.
   */
  force?: boolean;
  /**
   * Use Anthropic Message Batches API (50% off). Default from
   * TRANSLATION_USE_BATCH env unless overridden.
   */
  useMessageBatch?: boolean;
}

/** Defaults: translate pages then segment English; skip already-translated pages. */
export function buildTranslationRunOptions(
  input: TranslationRunOptionsInput = {},
): RunDayTranslationOptions {
  return {
    model: input.model,
    forceFetch: input.forceFetch === true,
    skipExistingPages: input.force !== true,
    useMessageBatch: input.useMessageBatch,
  };
}
