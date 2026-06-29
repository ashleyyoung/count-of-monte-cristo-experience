#!/usr/bin/env npx tsx
/**
 * scripts/summarize/summarize-day.ts
 *
 * Summarize one day's live translated_pages into doc.overview (Highlights).
 * Reads English page translations from R2; does not call Gallica.
 *
 * Usage:
 *   npx tsx scripts/summarize/summarize-day.ts --date=1844-08-28
 *   npx tsx scripts/summarize/summarize-day.ts --date=1844-08-28 --model=claude-haiku-4-5
 *   npx tsx scripts/summarize/summarize-day.ts --date=1844-08-28 --run-id=<uuid>
 *   npx tsx scripts/summarize/summarize-day.ts --help
 *
 * Prerequisite: doc.translated_pages must be populated (run translate-day first).
 *
 * When `--run-id` is given, transitions the matching translation_runs row through
 * running → done/failed (same table as translate-day).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";
import {
  runDaySummarization,
  type SummarizeRunSummary,
} from "../../lib/summarize/pipeline";

export type { SummarizeRunSummary };

const HELP = `summarize-day — summarize live translated_pages → doc.overview (Highlights)

Reads:  day_content.doc translated_pages (English text on R2).
Writes: translation_versions row (section=overview) + doc.overview.

Usage:
  npx tsx scripts/summarize/summarize-day.ts --date=YYYY-MM-DD [--model=<anthropic-model-id>] [--run-id=<uuid>]

  --model   Override TRANSLATION_MODEL for this run (default: env or claude-sonnet-4-6).
            Use claude-haiku-4-5 for cost experiments; claude-opus-4-8 for higher quality.`;

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function makeSupabaseClient(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

function parseCliDate(): string {
  const arg = process.argv.find((a) => a.startsWith("--date="));
  if (!arg) throw new Error("Required flag: --date=YYYY-MM-DD");
  const date = arg.replace("--date=", "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
  }
  return date;
}

function parseCliRunId(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--run-id="));
  return arg ? arg.replace("--run-id=", "") : undefined;
}

function parseCliModel(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--model="));
  return arg ? arg.replace("--model=", "").trim() : undefined;
}

async function markRunning(
  supabase: SupabaseClient,
  runId: string,
): Promise<void> {
  const { error } = await supabase
    .from("translation_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId);
  if (error) {
    console.error(
      `[summarize-day] Failed to mark run ${runId} running: ${error.message}`,
    );
  }
}

async function markDone(
  supabase: SupabaseClient,
  runId: string,
  summary: SummarizeRunSummary,
): Promise<void> {
  const { error } = await supabase
    .from("translation_runs")
    .update({
      status: "done",
      summary,
      error: summary.skipped ? (summary.skip_reason ?? "skipped") : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) {
    console.error(
      `[summarize-day] Failed to mark run ${runId} done: ${error.message}`,
    );
  }
}

async function markFailed(
  supabase: SupabaseClient,
  runId: string,
  err: unknown,
): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  const { error } = await supabase
    .from("translation_runs")
    .update({
      status: "failed",
      error: message,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) {
    console.error(
      `[summarize-day] Failed to mark run ${runId} failed: ${error.message}`,
    );
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }

  const date = parseCliDate();
  const runId = parseCliRunId();
  const model = parseCliModel();
  const supabase = makeSupabaseClient();

  const log = (msg: string) =>
    console.log(
      `[summarize-day] ${date}${runId ? ` (run ${runId})` : ""}: ${msg}`,
    );

  if (runId) await markRunning(supabase, runId);

  try {
    const summary = await runDaySummarization(date, log, { model });
    if (runId) await markDone(supabase, runId, summary);
    log(
      `Done. updated=${summary.updated} skipped=${summary.skipped}` +
        (summary.skip_reason ? ` reason=${summary.skip_reason}` : "") +
        ` cost=$${summary.cost_usd_total.toFixed(4)} model=${summary.model}`,
    );
    console.log(JSON.stringify({ date, runId, ...summary }));
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId) await markFailed(supabase, runId, err);
    console.error(JSON.stringify({ error: true, date, runId, message }));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[summarize-day] Unexpected error:", err);
  process.exit(1);
});
