#!/usr/bin/env npx tsx
/**
 * scripts/gallica/galignani-all.ts
 *
 * Batch runner for the Galignani's Messenger ingest across all installment
 * dates — the exact same dates as the Débats serialization (from schedule.json),
 * pulling each date's own Galignani issue. Single long-lived process sharing the
 * year-level Issues XML cache.
 *
 * Scans/text already in R2 are skipped by default; pass --force to re-fetch and
 * overwrite.
 *
 * Usage:
 *   npx tsx scripts/gallica/galignani-all.ts
 *   npx tsx scripts/gallica/galignani-all.ts --from=1844-08-28 --to=1844-10-19
 *   npx tsx scripts/gallica/galignani-all.ts --part=1 --force
 */

import "dotenv/config";
import { isGallicaThrottleError } from "../../lib/gallica";
import { runPullGalignani } from "./pull-galignani";
import {
  DRY_RUN,
  REFRESH_GALLICA_CACHE,
  filterInstallments,
  parseCliFromDate,
  parseCliToDate,
  parseCliPart,
  parseCliDelayBetweenDates,
  parseCliCooldownOnError,
  parseCliMaxConsecutiveFailures,
  DEFAULT_RETRY_PASS_PAUSE_MS,
  sleep,
  waitForGallicaHealthy,
} from "./_shared";

const STOP_ON_ERROR = process.argv.includes("--stop-on-error");
const SKIP_PREFLIGHT = process.argv.includes("--skip-preflight");
const FORCE = process.argv.includes("--force");
/** Skip scans/text already in R2 by default; --force re-fetches and overwrites. */
const SKIP_EXISTING = !FORCE;

interface DateFailure {
  date: string;
  message: string;
}

async function processDate(day: string): Promise<{
  ok: boolean;
  message?: string;
  err?: unknown;
  allCached?: boolean;
  absent?: boolean;
}> {
  try {
    const result = await runPullGalignani({
      day,
      dryRun: DRY_RUN,
      skipExisting: SKIP_EXISTING,
      refreshGallicaCache: REFRESH_GALLICA_CACHE,
    });
    // No issue for this exact date (e.g. a Sunday) is a clean skip, not a failure.
    return { ok: true, allCached: result.allCached, absent: !result.found };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message, err };
  }
}

async function main() {
  const fromDate = parseCliFromDate();
  const toDate = parseCliToDate();
  const part = parseCliPart();
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

  console.log(`[galignani-all] Starting ${dates.length} date(s)`);
  console.log(
    `[galignani-all] Delay between dates: ${delayBetweenDatesMs / 1000}s; cooldown on error: ${baseCooldownMs / 1000}s`,
  );
  console.log(
    FORCE
      ? "[galignani-all] --force: re-fetching and overwriting existing R2 objects"
      : "[galignani-all] Skipping scans/text already in R2 (pass --force to re-fetch)",
  );

  if (!SKIP_PREFLIGHT) {
    const healthy = await waitForGallicaHealthy((msg) =>
      console.error(`[galignani-all] ${msg}`),
    );
    if (!healthy) {
      console.error(
        `[galignani-all] Gallica preflight failed after retries — cooling down ${baseCooldownMs / 1000}s before starting (avoids hammering an already-struggling origin).`,
      );
      await sleep(baseCooldownMs);
    }
  }

  const failures: DateFailure[] = [];
  const pendingRetry: string[] = [];
  const absent: string[] = [];
  let completed = 0;
  let consecutiveFailures = 0;
  let currentCooldownMs = baseCooldownMs;

  const runBatch = async (batchDates: typeof dates, label: string) => {
    for (let i = 0; i < batchDates.length; i++) {
      const inst = batchDates[i];
      const result = await processDate(inst.date);

      if (result.ok) {
        consecutiveFailures = 0;
        currentCooldownMs = baseCooldownMs;
        completed++;
        if (result.absent) {
          absent.push(inst.date);
          console.log(
            `[galignani-all] Absent ${inst.date} (${completed}/${dates.length}) [${label}] — no issue published this day, skipped`,
          );
        } else {
          console.log(
            `[galignani-all] Completed ${inst.date} (${completed}/${dates.length}) [${label}]`,
          );
        }
      } else {
        consecutiveFailures++;
        failures.push({ date: inst.date, message: result.message ?? "unknown" });
        pendingRetry.push(inst.date);
        console.error(`[galignani-all] FAILED ${inst.date}: ${result.message}`);

        if (STOP_ON_ERROR) throw new Error(`Stopped on error at ${inst.date}`);
        if (consecutiveFailures >= maxConsecutiveFailures) {
          throw new Error(
            `${maxConsecutiveFailures} consecutive failures — aborting batch`,
          );
        }

        if (isGallicaThrottleError(result.err)) {
          console.log(
            `[galignani-all] Gallica throttle/DNS error — cooling down ${currentCooldownMs / 1000}s…`,
          );
          await sleep(currentCooldownMs);
          // 30min cap (matching ingest-range): ride out a longer BnF-side
          // quota/penalty window rather than burning through
          // --max-consecutive-failures on a block that would've lifted soon.
          currentCooldownMs = Math.min(currentCooldownMs * 2, 1_800_000);
        }
      }

      const hasMore = i < batchDates.length - 1;
      if (hasMore && delayBetweenDatesMs > 0) {
        if (result.ok && result.allCached) {
          console.log(
            `[galignani-all] ${inst.date}: all pages were cache hits — skipping inter-date delay.`,
          );
        } else {
          console.log(
            `[galignani-all] Waiting ${delayBetweenDatesMs / 1000}s before next date…`,
          );
          await sleep(delayBetweenDatesMs);
        }
      }
    }
  };

  try {
    await runBatch(dates, "primary");
  } catch (err) {
    console.error(
      `[galignani-all] Batch aborted: ${err instanceof Error ? err.message : err}`,
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
      `[galignani-all] Retry pass: ${uniqueRetry.length} date(s) after ${DEFAULT_RETRY_PASS_PAUSE_MS / 1000}s pause`,
    );
    await sleep(DEFAULT_RETRY_PASS_PAUSE_MS);

    const retryDates = dates.filter((d) => uniqueRetry.includes(d.date));
    consecutiveFailures = 0;
    currentCooldownMs = baseCooldownMs;
    for (let i = failures.length - 1; i >= 0; i--) {
      if (uniqueRetry.includes(failures[i].date)) failures.splice(i, 1);
    }
    pendingRetry.length = 0;

    try {
      await runBatch(retryDates, "retry");
    } catch (err) {
      console.error(
        `[galignani-all] Retry pass aborted: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const absentDates = [...new Set(absent)].sort();
  if (absentDates.length > 0) {
    console.log(
      `[galignani-all] ${absentDates.length} date(s) had no Galignani issue (not published — typically Sundays), skipped:\n  ${absentDates.join(", ")}`,
    );
  }

  console.log(
    JSON.stringify({
      ok: failures.length === 0,
      completed,
      ingested: completed - absentDates.length,
      absent: absentDates.length,
      total: dates.length,
      failures,
      absentDates,
      dryRun: DRY_RUN,
      skipExisting: SKIP_EXISTING,
    }),
  );

  if (failures.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[galignani-all] Unexpected error:", err);
  process.exit(1);
});
