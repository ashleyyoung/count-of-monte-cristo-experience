#!/usr/bin/env npx tsx
/**
 * scripts/translate/translate-day.ts
 *
 * Local CLI runner that translates a single day's content. This is the one
 * code path invoked by BOTH a terminal command and the admin UI's
 * "Re-translate day locally" button (via the `requestDayTranslation` server
 * action, which spawns this script detached).
 *
 * It owns the *run lifecycle* (queued -> running -> done/failed) and delegates
 * the actual per-section translation to the Sprint 9 pipeline
 * (extract-text -> lib/llm/translate.ts -> single-writer translation_versions
 * -> update-day-content). See `runDayTranslationPipeline` below for the
 * integration seam.
 *
 * Usage:
 *   npx tsx scripts/translate/translate-day.ts --date=1844-08-28
 *   npx tsx scripts/translate/translate-day.ts --date=1844-08-28 --run-id=<uuid>
 *
 * Environment (from .env / shell, inherited from the dev server when spawned):
 *   NEXT_PUBLIC_SUPABASE_URL    – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   – service-role key (bypasses RLS)
 *   ANTHROPIC_API_KEY, TRANSLATION_MODEL, … – consumed by the Sprint 9 pipeline
 *
 * When `--run-id` is given, this script transitions the matching
 * `translation_runs` row through `running` then `done`/`failed`, recording the
 * summary or error so the day page can show status on the next refresh.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";
import {
  runDayTranslation,
  type TranslationRunSummary,
} from "../../lib/translate/pipeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Summary returned by a completed day translation (mirrors translateDay). */
export type { TranslationRunSummary };

interface RunContext {
  date: string;
  supabase: SupabaseClient;
  log: (msg: string) => void;
}

// ---------------------------------------------------------------------------
// Env + client
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// translation_runs lifecycle helpers
// ---------------------------------------------------------------------------

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
      `[translate-day] Failed to mark run ${runId} running: ${error.message}`,
    );
  }
}

async function markDone(
  supabase: SupabaseClient,
  runId: string,
  summary: TranslationRunSummary,
): Promise<void> {
  const status = summary.failed.length > 0 ? "failed" : "done";
  const { error } = await supabase
    .from("translation_runs")
    .update({
      status,
      summary,
      error:
        summary.failed.length > 0
          ? `${summary.failed.length} section(s) failed`
          : null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) {
    console.error(
      `[translate-day] Failed to mark run ${runId} ${status}: ${error.message}`,
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
      `[translate-day] Failed to mark run ${runId} failed: ${error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Sprint 9 integration seam (wired)
// ---------------------------------------------------------------------------

/**
 * Translate every section of a day's issue via lib/translate/pipeline.ts.
 *
 * The pipeline handles its own Supabase + R2 clients; `ctx.supabase` is used
 * only for the translation_runs lifecycle helpers in this file.
 */
async function runDayTranslationPipeline(
  ctx: RunContext,
): Promise<TranslationRunSummary> {
  return runDayTranslation(ctx.date, ctx.log);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const date = parseCliDate();
  const runId = parseCliRunId();
  const supabase = makeSupabaseClient();

  const log = (msg: string) =>
    console.log(
      `[translate-day] ${date}${runId ? ` (run ${runId})` : ""}: ${msg}`,
    );

  if (runId) await markRunning(supabase, runId);

  try {
    const summary = await runDayTranslationPipeline({ date, supabase, log });
    if (runId) await markDone(supabase, runId, summary);
    log(
      `Done. translated=${summary.translated} challengers=${summary.challengers} ` +
        `created=${summary.created} skipped=${summary.skipped} failed=${summary.failed.length}`,
    );
    console.log(JSON.stringify({ date, runId, ...summary }));
    process.exit(summary.failed.length > 0 ? 1 : 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (runId) await markFailed(supabase, runId, err);
    console.error(JSON.stringify({ error: true, date, runId, message }));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[translate-day] Unexpected error:", err);
  process.exit(1);
});
