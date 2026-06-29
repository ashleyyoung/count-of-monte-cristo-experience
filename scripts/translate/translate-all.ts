#!/usr/bin/env npx tsx
/**
 * scripts/translate/translate-all.ts
 *
 * Batch runner for Débats translation across installment dates from schedule.json.
 * Calls runDayTranslation once per date; skips dates that already have full
 * translations unless --force. Skips individual pages already translated (R2
 * anchor cache or doc.translated_pages).
 *
 * Usage:
 *   npx tsx scripts/translate/translate-all.ts
 *   npx tsx scripts/translate/translate-all.ts --from=1844-08-28 --to=1844-10-19
 *   npx tsx scripts/translate/translate-all.ts --part=1 --force
 */

import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  runDayTranslation,
  docIsFullyTranslated,
  type TranslationRunSummary,
} from "../../lib/translate/pipeline";
import { buildTranslationRunOptions } from "../../lib/translate/run-options";
import { parseDayDoc } from "../../lib/types/content";
import {
  filterInstallments,
  parseCliFromDate,
  parseCliToDate,
  parseCliPart,
  DEFAULT_RETRY_PASS_PAUSE_MS,
  sleep,
} from "../gallica/_shared";

const STOP_ON_ERROR = process.argv.includes("--stop-on-error");
const FORCE = process.argv.includes("--force");
const SYNC = process.argv.includes("--sync");
const DEFAULT_MODEL = "claude-sonnet-4-6";

function translationRunOptions(model: string) {
  return buildTranslationRunOptions({
    model,
    force: FORCE,
    useMessageBatch: SYNC ? false : undefined,
  });
}

interface DateFailure {
  date: string;
  message: string;
  failedSections?: TranslationRunSummary["failed"];
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function makeSupabaseClient(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

function parseCliModel(): string {
  const arg = process.argv.find((a) => a.startsWith("--model="));
  return arg ? arg.replace("--model=", "").trim() : DEFAULT_MODEL;
}

function parseCliDelaySeconds(): number {
  const arg = process.argv.find((a) => a.startsWith("--delay="));
  if (!arg) return 5;
  const n = parseInt(arg.replace("--delay=", ""), 10);
  if (isNaN(n) || n < 0) throw new Error(`Invalid --delay value: ${arg}`);
  return n;
}

async function fetchAlreadyTranslatedDates(
  supabase: SupabaseClient,
  dates: string[],
): Promise<Set<string>> {
  const translated = new Set<string>();
  if (dates.length === 0) return translated;

  const { data, error } = await supabase
    .from("day_content")
    .select("installment_date, doc")
    .in("installment_date", dates);

  if (error) {
    throw new Error(
      `[translate-all] Failed to load day_content for skip check: ${error.message}`,
    );
  }

  for (const row of data ?? []) {
    const date = row.installment_date as string;
    const doc = parseDayDoc(row.doc ?? {});
    if (docIsFullyTranslated(doc)) {
      translated.add(date);
    }
  }

  return translated;
}

async function processDate(
  date: string,
  model: string,
): Promise<{ ok: boolean; summary?: TranslationRunSummary; message?: string }> {
  const log = (msg: string) => console.log(`[translate-all] ${date}: ${msg}`);

  try {
    const summary = await runDayTranslation(
      date,
      log,
      translationRunOptions(model),
    );

    if (summary.failed.length > 0) {
      const message = `${summary.failed.length} section(s) failed`;
      return { ok: false, summary, message };
    }

    return { ok: true, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(`translate-all — batch translate Débats installments

Reads French intermediate from R2 (or fetches ALTO). Every LLM call persists output:
immutable EN keys (date/en/slot_key/run_timestamp.txt), translation_versions
rows, and day_content updates after each section (same versioning as admin compare).

Usage:
  npx tsx scripts/translate/translate-all.ts [--from=YYYY-MM-DD --to=YYYY-MM-DD] [options]

Options:
  --from=YYYY-MM-DD     First installment date (inclusive)
  --to=YYYY-MM-DD       Last installment date (inclusive)
  --part=N              Filter to serialization part 1–4
  --force               Re-translate dates and pages even when already done
  --sync                Streaming API instead of Message Batches (full price)
  --model=<id>          Translation model (default: claude-sonnet-4-6)
  --delay=<seconds>     Pause between dates (default: 5)
  --stop-on-error       Abort on first failed date`);
    return;
  }

  const fromDate = parseCliFromDate();
  const toDate = parseCliToDate();
  const part = parseCliPart();
  const model = parseCliModel();
  const delaySeconds = parseCliDelaySeconds();
  const delayMs = delaySeconds * 1_000;

  const allDates = filterInstallments(fromDate, toDate, part);
  if (allDates.length === 0) {
    console.log(
      JSON.stringify({
        ok: true,
        message: "No installments matched the requested filters",
        fromDate,
        toDate,
        part,
      }),
    );
    return;
  }

  let dates = allDates.map((d) => d.date);
  let skippedExisting = 0;

  if (!FORCE) {
    const supabase = makeSupabaseClient();
    const alreadyTranslated = await fetchAlreadyTranslatedDates(
      supabase,
      dates,
    );
    const remaining = dates.filter((d) => !alreadyTranslated.has(d));
    skippedExisting = dates.length - remaining.length;
    dates = remaining;
  }

  if (dates.length === 0) {
    console.log(
      `[translate-all] All ${allDates.length} date(s) already translated — nothing to do.`,
    );
    return;
  }

  console.log(
    `[translate-all] Starting ${dates.length} date(s)` +
      (fromDate || toDate
        ? ` from ${fromDate ?? "(start)"} to ${toDate ?? "(end)"}`
        : ` of ${allDates.length} in schedule`) +
      (skippedExisting > 0
        ? ` (${skippedExisting} skipped — already translated)`
        : "") +
      `; model=${model}; ${delaySeconds}s between dates`,
  );

  const failures: DateFailure[] = [];
  const pendingRetry: string[] = [];
  let completed = 0;
  let runningCostUsd = 0;

  const runBatch = async (batchDates: string[], label: string) => {
    for (let i = 0; i < batchDates.length; i++) {
      const date = batchDates[i];
      console.log(
        `[translate-all] ${date} (${i + 1}/${batchDates.length}) [${label}] translating…`,
      );

      const result = await processDate(date, model);

      if (result.ok && result.summary) {
        completed++;
        runningCostUsd += result.summary.cost_usd_total;
        console.log(
          `[translate-all] ${date}: done. translated=${result.summary.translated} ` +
            `challengers=${result.summary.challengers} created=${result.summary.created} ` +
            `skipped=${result.summary.skipped} cost=$${result.summary.cost_usd_total.toFixed(4)} ` +
            `running_total=$${runningCostUsd.toFixed(4)}`,
        );
      } else {
        failures.push({
          date,
          message: result.message ?? "unknown error",
          failedSections: result.summary?.failed,
        });
        pendingRetry.push(date);
        console.error(`[translate-all] FAILED ${date}: ${result.message}`);

        if (STOP_ON_ERROR) {
          throw new Error(`Stopped on error at ${date}`);
        }
      }

      const hasMore = i < batchDates.length - 1;
      if (hasMore && delayMs > 0) {
        console.log(
          `[translate-all] Waiting ${delaySeconds}s before next date…`,
        );
        await sleep(delayMs);
      }
    }
  };

  try {
    await runBatch(dates, "primary");
  } catch (err) {
    console.error(
      `[translate-all] Batch aborted: ${err instanceof Error ? err.message : err}`,
    );
    printFailureSummary(failures, completed, dates.length, runningCostUsd);
    process.exit(1);
  }

  const uniqueRetry = [...new Set(pendingRetry)];
  if (uniqueRetry.length > 0) {
    console.log(
      `[translate-all] Retry pass: ${uniqueRetry.length} date(s) after ${DEFAULT_RETRY_PASS_PAUSE_MS / 1000}s pause`,
    );
    await sleep(DEFAULT_RETRY_PASS_PAUSE_MS);

    for (let i = failures.length - 1; i >= 0; i--) {
      if (uniqueRetry.includes(failures[i].date)) failures.splice(i, 1);
    }
    pendingRetry.length = 0;

    try {
      await runBatch(uniqueRetry, "retry");
    } catch (err) {
      console.error(
        `[translate-all] Retry pass aborted: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  printFailureSummary(failures, completed, dates.length, runningCostUsd);

  console.log(
    JSON.stringify({
      ok: failures.length === 0,
      completed,
      total: dates.length,
      skippedExisting,
      cost_usd_total: runningCostUsd,
      model,
      ...translationRunOptions(model),
      failures: failures.map((f) => ({
        date: f.date,
        message: f.message,
      })),
    }),
  );

  if (failures.length > 0) process.exit(1);
}

function printFailureSummary(
  failures: DateFailure[],
  completed: number,
  total: number,
  costUsd: number,
): void {
  console.log(`\n[translate-all] ── Summary ──`);
  console.log(`[translate-all] Completed: ${completed}/${total}`);
  console.log(`[translate-all] Total cost: $${costUsd.toFixed(4)}`);

  if (failures.length === 0) {
    console.log("[translate-all] All dates succeeded.");
    return;
  }

  console.log(`[translate-all] Failed (${failures.length}):`);
  for (const f of failures) {
    console.log(`  ${f.date}  ${f.message}`);
    if (f.failedSections?.length) {
      for (const s of f.failedSections) {
        console.log(`    ${s.section}/${s.slot_key} (${s.stage}): ${s.error}`);
      }
    }
  }

  console.log(
    `\n[translate-all] To retry failed dates individually:\n` +
      failures
        .map(
          (f) =>
            `  npx tsx scripts/translate/translate-day.ts --date=${f.date}` +
            (parseCliModel() !== DEFAULT_MODEL
              ? ` --model=${parseCliModel()}`
              : ""),
        )
        .join("\n"),
  );
}

main().catch((err) => {
  console.error("[translate-all] Unexpected error:", err);
  process.exit(1);
});
