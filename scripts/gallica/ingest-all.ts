#!/usr/bin/env npx tsx
/**
 * scripts/gallica/ingest-all.ts
 *
 * Batch runner for the Gallica scan pipeline across all serialization dates.
 * Single long-lived process with shared year-level Issues XML cache.
 *
 * Usage:
 *   npx tsx scripts/gallica/ingest-all.ts --skip-existing
 *   npx tsx scripts/gallica/ingest-all.ts --steps=pull,crop --skip-existing
 *   npx tsx scripts/gallica/ingest-all.ts --from=1844-08-28 --to=1844-10-19
 */

import { isGallicaThrottleError } from "../../lib/gallica";
import { runResolveIssue } from "./resolve-issue";
import { runPullScans } from "./pull-scans";
import { runCropStrip } from "./crop-strip";
import {
  DRY_RUN,
  SKIP_EXISTING,
  REFRESH_GALLICA_CACHE,
  filterInstallments,
  parseCliFromDate,
  parseCliToDate,
  parseCliPart,
  parseCliSteps,
  parseCliDelayBetweenDates,
  parseCliCooldownOnError,
  parseCliMaxConsecutiveFailures,
  DEFAULT_RETRY_PASS_PAUSE_MS,
  sleep,
  type GallicaStepOptions,
} from "./_shared";

const STOP_ON_ERROR = process.argv.includes("--stop-on-error");

type Step = "resolve" | "pull" | "crop";

interface DateFailure {
  date: string;
  step: Step;
  message: string;
}

function stepOptions(day: string): GallicaStepOptions {
  return {
    day,
    dryRun: DRY_RUN,
    skipExisting: SKIP_EXISTING,
    refreshGallicaCache: REFRESH_GALLICA_CACHE,
  };
}

async function runStep(step: Step, day: string): Promise<void> {
  console.log(`[ingest-all] ${day} → ${step}`);
  const opts = stepOptions(day);

  switch (step) {
    case "resolve":
      await runResolveIssue(opts);
      break;
    case "pull":
      await runPullScans(opts);
      break;
    case "crop":
      await runCropStrip(opts);
      break;
  }
}

async function processDate(
  day: string,
  steps: Set<Step>,
): Promise<{
  ok: boolean;
  failedStep?: Step;
  message?: string;
  err?: unknown;
}> {
  for (const step of ["resolve", "pull", "crop"] as const) {
    if (!steps.has(step)) continue;
    try {
      await runStep(step, day);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, failedStep: step, message, err };
    }
  }
  return { ok: true };
}

async function main() {
  const fromDate = parseCliFromDate();
  const toDate = parseCliToDate();
  const part = parseCliPart();
  const steps = parseCliSteps();
  const delayBetweenDatesMs = parseCliDelayBetweenDates();
  const baseCooldownMs = parseCliCooldownOnError();
  const maxConsecutiveFailures = parseCliMaxConsecutiveFailures();
  const dates = filterInstallments(fromDate, toDate, part);

  if (dates.length === 0) {
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

  console.log(
    `[ingest-all] Starting ${dates.length} date(s); steps: ${[...steps].join(", ")}`,
  );
  console.log(
    `[ingest-all] Delay between dates: ${delayBetweenDatesMs / 1000}s; cooldown on error: ${baseCooldownMs / 1000}s`,
  );
  if (SKIP_EXISTING) {
    console.log("[ingest-all] --skip-existing enabled");
  }

  const failures: DateFailure[] = [];
  const pendingRetry: string[] = [];
  let completed = 0;
  let consecutiveFailures = 0;
  let currentCooldownMs = baseCooldownMs;

  const runBatch = async (batchDates: typeof dates, label: string) => {
    for (let i = 0; i < batchDates.length; i++) {
      const inst = batchDates[i];
      const result = await processDate(inst.date, steps);

      if (result.ok) {
        consecutiveFailures = 0;
        currentCooldownMs = baseCooldownMs;
        completed++;
        console.log(
          `[ingest-all] Completed ${inst.date} (${completed}/${dates.length}) [${label}]`,
        );
      } else {
        consecutiveFailures++;
        failures.push({
          date: inst.date,
          step: result.failedStep!,
          message: result.message ?? "unknown error",
        });
        pendingRetry.push(inst.date);
        console.error(
          `[ingest-all] FAILED ${inst.date} / ${result.failedStep}: ${result.message}`,
        );

        if (STOP_ON_ERROR) {
          throw new Error(`Stopped on error at ${inst.date}`);
        }

        if (consecutiveFailures >= maxConsecutiveFailures) {
          throw new Error(
            `${maxConsecutiveFailures} consecutive failures — aborting batch`,
          );
        }

        const throttle = isGallicaThrottleError(result.err);
        if (throttle) {
          console.log(
            `[ingest-all] Gallica throttle/DNS error — cooling down ${currentCooldownMs / 1000}s…`,
          );
          await sleep(currentCooldownMs);
          currentCooldownMs = Math.min(currentCooldownMs * 2, 900_000);
        }
      }

      const hasMore = i < batchDates.length - 1;
      if (hasMore && delayBetweenDatesMs > 0) {
        console.log(
          `[ingest-all] Waiting ${delayBetweenDatesMs / 1000}s before next date…`,
        );
        await sleep(delayBetweenDatesMs);
      }
    }
  };

  try {
    await runBatch(dates, "primary");
  } catch (err) {
    console.error(
      `[ingest-all] Batch aborted: ${err instanceof Error ? err.message : err}`,
    );
    console.log(
      JSON.stringify({
        ok: false,
        completed,
        total: dates.length,
        failures,
        aborted: true,
      }),
    );
    process.exit(1);
  }

  const uniqueRetry = [...new Set(pendingRetry)];
  if (uniqueRetry.length > 0) {
    console.log(
      `[ingest-all] Retry pass: ${uniqueRetry.length} date(s) after ${DEFAULT_RETRY_PASS_PAUSE_MS / 1000}s pause`,
    );
    await sleep(DEFAULT_RETRY_PASS_PAUSE_MS);

    const retryDates = dates.filter((d) => uniqueRetry.includes(d.date));
    consecutiveFailures = 0;
    currentCooldownMs = baseCooldownMs;

    for (let i = failures.length - 1; i >= 0; i--) {
      if (uniqueRetry.includes(failures[i].date)) {
        failures.splice(i, 1);
      }
    }
    pendingRetry.length = 0;

    try {
      await runBatch(retryDates, "retry");
    } catch (err) {
      console.error(
        `[ingest-all] Retry pass aborted: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(
    JSON.stringify({
      ok: failures.length === 0,
      completed,
      total: dates.length,
      failures,
      dryRun: DRY_RUN,
      skipExisting: SKIP_EXISTING,
    }),
  );

  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[ingest-all] Unexpected error:", err);
  process.exit(1);
});
