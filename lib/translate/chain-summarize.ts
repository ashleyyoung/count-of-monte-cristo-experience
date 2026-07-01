/**
 * Chain Pass C (summarize-day) after a successful translation run.
 */

import { runDaySummarization } from "../summarize/pipeline";
import type { TranslationRunSummary } from "./pipeline";

export async function chainSummarizeAfterTranslation(
  date: string,
  summary: TranslationRunSummary,
  log: (msg: string) => void,
  model?: string,
): Promise<void> {
  try {
    const summarize = await runDaySummarization(date, log, { model });
    summary.summarize = summarize;
    if (summarize.updated) {
      summary.cost_usd_total += summarize.cost_usd_total;
    }
    log(
      `[pipeline] Summarize chained: updated=${summarize.updated} ` +
        `skipped=${summarize.skipped}` +
        (summarize.skip_reason ? ` (${summarize.skip_reason})` : ""),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(
      `[pipeline] Summarize failed (translation still succeeded): ${message}`,
    );
    summary.summarize = {
      updated: false,
      skipped: true,
      cost_usd_total: 0,
      model: model ?? "",
      error: message,
    };
  }
}
