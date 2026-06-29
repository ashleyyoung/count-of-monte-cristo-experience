#!/usr/bin/env npx tsx
/**
 * scripts/translate/translate-day.ts
 *
 * Translate one day's issue: read the French intermediate already in R2 (written
 * by a fetch-french-* script), translate + segment it with Claude, and write the
 * English output to translation_versions + day_content. If no French intermediate
 * exists yet, it fetches Gallica texteBrut once as the default.
 *
 * This is the one code path invoked by BOTH a terminal command and the admin
 * UI's "Translate" button (via the requestDayTranslation server
 * action, which spawns this script detached). It owns the run lifecycle
 * (queued -> running -> done/failed) and delegates to lib/translate/pipeline.ts.
 *
 * Usage:
 *   npx tsx scripts/translate/translate-day.ts --date=1844-08-28
 *   npx tsx scripts/translate/translate-day.ts --date=1844-08-28 --run-id=<uuid>
 *   npx tsx scripts/translate/translate-day.ts --date=1844-08-28 --force-fetch
 *   npx tsx scripts/translate/translate-day.ts --date=1844-08-28 --model=claude-sonnet-4-6
 *   npx tsx scripts/translate/translate-day.ts --help
 *
 * To use ALTO or vision instead of texteBrut, run that fetch script first:
 *   npx tsx scripts/translate/fetch-french-alto.ts --date=1844-08-28
 *   npx tsx scripts/translate/translate-day.ts --date=1844-08-28
 *
 * Environment (from .env / shell, inherited from the dev server when spawned):
 *   NEXT_PUBLIC_SUPABASE_URL    – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   – service-role key (bypasses RLS)
 *   ANTHROPIC_API_KEY, TRANSLATION_MODEL, … – consumed by the pipeline
 *
 * When `--run-id` is given, this script transitions the matching
 * `translation_runs` row through `running` then `done`/`failed`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";
import {
  runDayTranslation,
  type TranslationRunSummary,
} from "../../lib/translate/pipeline";
import { buildTranslationRunOptions } from "../../lib/translate/run-options";

export type { TranslationRunSummary };

const HELP = `translate-day — translate one issue's French intermediate → English

Reads:  the French intermediate in R2 (texteBrut → ALTO → vision precedence);
        fetches Gallica texteBrut once if none exists.
Writes: translation_versions rows + day_content.doc for the date.

Usage:
  npx tsx scripts/translate/translate-day.ts --date=YYYY-MM-DD [options]

Options:
  --model=<id>     Override TRANSLATION_MODEL (default: claude-sonnet-4-6)
  --run-id=<uuid>  translation_runs lifecycle (admin local runner)
  --force-fetch    Re-fetch Gallica French source
  --force          Redo everything even when already translated (new version rows)
  --sync           Use streaming API instead of Message Batches (full price, faster feedback)

Default: translate pages then segment into tabs via Message Batches API (50% off).`;

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

function parseCliModel(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--model="));
  return arg ? arg.replace("--model=", "").trim() : undefined;
}

const FORCE_FETCH = process.argv.includes("--force-fetch");
const FORCE = process.argv.includes("--force");
const SYNC = process.argv.includes("--sync");

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
// Main
// ---------------------------------------------------------------------------

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
      `[translate-day] ${date}${runId ? ` (run ${runId})` : ""}: ${msg}`,
    );

  if (runId) await markRunning(supabase, runId);

  try {
    const summary = await runDayTranslation(
      date,
      log,
      buildTranslationRunOptions({
        forceFetch: FORCE_FETCH,
        force: FORCE,
        model,
        useMessageBatch: SYNC ? false : undefined,
      }),
    );
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
