#!/usr/bin/env npx tsx
/**
 * scripts/ingest-range.ts
 *
 * Batch ingest for a range of Monte Cristo installment dates.
 * Filters to only dates in the serialization schedule, pauses between
 * each date to respect Gallica rate limits, and prints a summary of any
 * failures at the end.
 *
 * Usage:
 *   npx tsx scripts/ingest-range.ts --from=1844-08-28 --to=1844-09-07
 *   npx tsx scripts/ingest-range.ts --from=1844-08-28 --to=1844-09-07 --skip-translation
 *   npx tsx scripts/ingest-range.ts --help
 */

import "dotenv/config";
import { isGallicaThrottleError } from "../lib/gallica";
import {
  parseCliFromDate,
  parseCliToDate,
  filterInstallments,
  parseCliDelayBetweenDates,
  parseCliCooldownOnError,
  parseCliMaxConsecutiveFailures,
  DEFAULT_RETRY_PASS_PAUSE_MS,
  sleep,
} from "./gallica/_shared";
import { runIngestDay, type IngestDayOptions } from "./ingest-day";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const FORCE = process.argv.includes("--force");
const SKIP_TRANSLATION = process.argv.includes("--skip-translation");
const STOP_ON_ERROR = process.argv.includes("--stop-on-error");

function parseCliModel(): string | undefined {
  const arg = process.argv.find((a) => a.startsWith("--model="));
  return arg ? arg.replace("--model=", "").trim() : undefined;
}

function parseCliDelay(): number {
  const arg = process.argv.find((a) => a.startsWith("--delay="));
  if (!arg) return parseCliDelayBetweenDates() / 1_000;
  const n = parseInt(arg.replace("--delay=", ""), 10);
  if (isNaN(n) || n < 0) throw new Error(`Invalid --delay value: ${arg}`);
  return n;
}

const HELP = `ingest-range — batch ingest for a range of installment dates

Only dates in the Monte Cristo serialization schedule are processed; gaps
(e.g. Sundays) are silently skipped. Gallica requests are spaced by --delay
seconds between dates (default 60) to respect rate limits.

Steps per date: resolve-issue → pull-scans → crop-strip → fetch-french-textebrut → [translate-day]

Usage:
  npx tsx scripts/ingest-range.ts --from=YYYY-MM-DD --to=YYYY-MM-DD [options]

Required:
  --from=YYYY-MM-DD    First date (inclusive).
  --to=YYYY-MM-DD      Last date (inclusive).

Options:
  --skip-translation   Fetch scans and French source only; skip translate-day.
                       Run translate-day.ts separately for each date afterwards.
  --force              Re-download and overwrite scans/crops already in R2.
                       Default is to skip existing files.
  --model=<id>         Override TRANSLATION_MODEL for the translate step.
  --delay=<seconds>    Pause between dates in seconds (default: 60).
  --cooldown-on-error=<seconds>  Cooldown after throttle/DNS errors (default: 300).
  --max-consecutive-failures=N   Abort after N consecutive failures (default: 5).
  --stop-on-error      Stop the batch on the first failed date.

After each date completes, a failure summary is printed. Failed dates are
retried once after a 10-minute pause. Exit code is 1 if any date still failed.`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface DateFailure {
  date: string;
  message: string;
  err?: unknown;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }

  const fromDate = parseCliFromDate();
  const toDate = parseCliToDate();

  if (!fromDate || !toDate) {
    console.error(
      "[ingest-range] --from and --to are required. Run with --help for usage.",
    );
    process.exit(1);
  }

  const delaySeconds = parseCliDelay();
  const delayBetweenDatesMs = delaySeconds * 1_000;
  const baseCooldownMs = parseCliCooldownOnError();
  const maxConsecutiveFailures = parseCliMaxConsecutiveFailures();
  const model = parseCliModel();

  const installments = filterInstallments(fromDate, toDate);
  if (installments.length === 0) {
    console.error(
      `[ingest-range] No installments in schedule between ${fromDate} and ${toDate}.`,
    );
    return;
  }

  const options: IngestDayOptions = {
    force: FORCE,
    skipTranslation: SKIP_TRANSLATION,
    model,
  };

  console.error(
    `[ingest-range] ${installments.length} date(s) from ${fromDate} to ${toDate}` +
      (SKIP_TRANSLATION ? " (translation skipped)" : "") +
      (FORCE ? " (--force)" : "") +
      `; ${delaySeconds}s between dates; cooldown on error: ${baseCooldownMs / 1000}s.`,
  );
  console.error(
    `[ingest-range] Dates: ${installments.map((i) => i.date).join(", ")}`,
  );

  const failures: DateFailure[] = [];
  const pendingRetry: string[] = [];
  let completed = 0;
  let consecutiveFailures = 0;
  let currentCooldownMs = baseCooldownMs;

  const runBatch = async (
    batch: typeof installments,
    label: string,
  ): Promise<void> => {
    for (let i = 0; i < batch.length; i++) {
      const { date } = batch[i];
      console.error(
        `\n[ingest-range] ── ${date} (${i + 1}/${batch.length}) [${label}] ──`,
      );

      let err: unknown;
      try {
        const result = await runIngestDay(date, options);
        if (result.ok) {
          consecutiveFailures = 0;
          currentCooldownMs = baseCooldownMs;
          if (!result.skipped) completed++;
          console.error(
            `[ingest-range] ${date}: ✓ done (${completed}/${installments.length})`,
          );
        } else {
          err = new Error(result.message ?? "unknown error");
          throw err;
        }
      } catch (e) {
        err = e;
        consecutiveFailures++;
        const message = e instanceof Error ? e.message : String(e);
        failures.push({ date, message, err });
        pendingRetry.push(date);
        console.error(`[ingest-range] ${date}: ✗ failed — ${message}`);

        if (STOP_ON_ERROR) {
          throw new Error(`Stopped on error at ${date}`);
        }

        if (consecutiveFailures >= maxConsecutiveFailures) {
          throw new Error(
            `${maxConsecutiveFailures} consecutive failures — aborting batch`,
          );
        }

        if (isGallicaThrottleError(err)) {
          console.error(
            `[ingest-range] Gallica throttle/DNS error — cooling down ${currentCooldownMs / 1000}s…`,
          );
          await sleep(currentCooldownMs);
          currentCooldownMs = Math.min(currentCooldownMs * 2, 900_000);
        }
      }

      const hasMore = i < batch.length - 1;
      if (hasMore && delayBetweenDatesMs > 0) {
        console.error(
          `[ingest-range] Waiting ${delaySeconds}s before next date…`,
        );
        await sleep(delayBetweenDatesMs);
      }
    }
  };

  try {
    await runBatch(installments, "primary");
  } catch (err) {
    console.error(
      `[ingest-range] Batch aborted: ${err instanceof Error ? err.message : err}`,
    );
    printSummary(failures, completed, installments.length);
    process.exit(1);
  }

  const uniqueRetry = [...new Set(pendingRetry)];
  if (uniqueRetry.length > 0) {
    console.error(
      `[ingest-range] Retry pass: ${uniqueRetry.length} date(s) after ${DEFAULT_RETRY_PASS_PAUSE_MS / 1000}s pause`,
    );
    await sleep(DEFAULT_RETRY_PASS_PAUSE_MS);

    const retryDates = installments.filter((d) => uniqueRetry.includes(d.date));
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
        `[ingest-range] Retry pass aborted: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  printSummary(failures, completed, installments.length);
  if (failures.length > 0) process.exit(1);
}

function printSummary(
  failures: DateFailure[],
  completed: number,
  total: number,
): void {
  console.error(`\n[ingest-range] ── Summary ──`);
  console.error(`[ingest-range] Completed: ${completed}/${total}`);

  if (failures.length === 0) {
    console.error("[ingest-range] All dates succeeded.");
    return;
  }

  console.error(`[ingest-range] Failed (${failures.length}):`);
  for (const f of failures) {
    console.error(`  ${f.date}  ${f.message}`);
  }
  console.error(
    `\n[ingest-range] To retry failed dates individually:\n` +
      failures
        .map(
          (f) =>
            `  npx tsx scripts/ingest-day.ts --date=${f.date}` +
            (SKIP_TRANSLATION ? " --skip-translation" : "") +
            (FORCE ? " --force" : "") +
            (parseCliModel() ? ` --model=${parseCliModel()}` : ""),
        )
        .join("\n"),
  );
}

main().catch((err) => {
  console.error(
    "[ingest-range] Unexpected error:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
