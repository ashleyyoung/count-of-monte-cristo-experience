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
import { r2ObjectExists } from "../lib/r2-server";
import { altoR2Key } from "../lib/translate/french-source";
import {
  parseCliFromDate,
  parseCliToDate,
  filterInstallments,
  parseCliDelayBetweenDates,
  parseCliCooldownOnError,
  parseCliMaxConsecutiveFailures,
  DEFAULT_RETRY_PASS_PAUSE_MS,
  sleep,
  waitForGallicaHealthy,
} from "./gallica/_shared";
import { runIngestDay, type IngestDayOptions } from "./ingest-day";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const FORCE = process.argv.includes("--force");
const SKIP_TRANSLATION = process.argv.includes("--skip-translation");
const SKIP_CROP_STRIP = process.argv.includes("--skip-crop-strip");
const STOP_ON_ERROR = process.argv.includes("--stop-on-error");
const SKIP_PREFLIGHT = process.argv.includes("--skip-preflight");

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

Steps per date: resolve-issue → pull-scans → crop-strip → fetch-french-source (ALTO) → [translate-day]

Usage:
  npx tsx scripts/ingest-range.ts [--from=YYYY-MM-DD --to=YYYY-MM-DD] [options]

With no --from/--to, sweeps the entire schedule and skips any date that
already has a Gallica ALTO French-source file in R2 — i.e. resumes an
overnight run, only touching dates that haven't succeeded yet. --force
disables this skip (and reprocesses everything in range).

Optional:
  --from=YYYY-MM-DD    First date (inclusive). Omit for the start of the schedule.
  --to=YYYY-MM-DD      Last date (inclusive). Omit for the end of the schedule.

Options:
  --skip-translation   Fetch scans and French source only; skip translate-day.
                       Run translate-day.ts separately for each date afterwards.
  --skip-crop-strip    Skip the crop-strip step for all dates. Use when auto-derivation
                       fails for some issues; run crop-strip.ts manually for those dates.
  --force              Re-download and overwrite scans/crops already in R2.
                       Default is to skip existing files.
  --model=<id>         Override TRANSLATION_MODEL for the translate step.
  --delay=<seconds>    Pause between dates in seconds (default: 60).
  --cooldown-on-error=<seconds>  Cooldown after throttle/DNS errors (default: 300).
  --max-consecutive-failures=N   Abort after N consecutive failures (default: 5).
  --stop-on-error      Stop the batch on the first failed date.
  --skip-preflight     Skip the Gallica reachability check before starting.

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

  const delaySeconds = parseCliDelay();
  const delayBetweenDatesMs = delaySeconds * 1_000;
  const baseCooldownMs = parseCliCooldownOnError();
  const maxConsecutiveFailures = parseCliMaxConsecutiveFailures();
  const model = parseCliModel();

  const requested = filterInstallments(fromDate, toDate);
  if (requested.length === 0) {
    console.error(
      `[ingest-range] No installments in schedule between ${fromDate ?? "(start)"} and ${toDate ?? "(end)"}.`,
    );
    return;
  }

  // No --from/--to: sweep the whole schedule, skipping dates that already
  // have an ALTO French-source file in R2 (the marker the automated pipeline
  // writes once a date has succeeded). --force disables this skip.
  let installments = requested;
  let skippedExisting = 0;
  if (!fromDate && !toDate && !FORCE) {
    const remaining: typeof requested = [];
    for (const inst of requested) {
      if (await r2ObjectExists(altoR2Key(inst.date))) {
        skippedExisting++;
      } else {
        remaining.push(inst);
      }
    }
    installments = remaining;
  }
  if (installments.length === 0) {
    console.error(
      `[ingest-range] All ${requested.length} installment(s) already have ALTO in R2 — nothing to do.`,
    );
    return;
  }

  const options: IngestDayOptions = {
    force: FORCE,
    skipTranslation: SKIP_TRANSLATION,
    skipCropStrip: SKIP_CROP_STRIP,
    model,
  };

  console.error(
    `[ingest-range] ${installments.length} date(s)` +
      (fromDate || toDate
        ? ` from ${fromDate ?? "(start)"} to ${toDate ?? "(end)"}`
        : ` of ${requested.length} in schedule` +
          (skippedExisting > 0
            ? ` (${skippedExisting} skipped — already have ALTO)`
            : "")) +
      (SKIP_TRANSLATION ? " (translation skipped)" : "") +
      (FORCE ? " (--force)" : "") +
      `; ${delaySeconds}s between dates; cooldown on error: ${baseCooldownMs / 1000}s.`,
  );
  console.error(
    `[ingest-range] Dates: ${installments.map((i) => i.date).join(", ")}`,
  );

  if (!SKIP_PREFLIGHT) {
    const healthy = await waitForGallicaHealthy((msg) =>
      console.error(`[ingest-range] ${msg}`),
    );
    if (!healthy) {
      console.error(
        `[ingest-range] Gallica preflight failed after retries — cooling down ${baseCooldownMs / 1000}s before starting (avoids hammering an already-struggling origin).`,
      );
      await sleep(baseCooldownMs);
    }
  }

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
      let allCached = false;
      try {
        const result = await runIngestDay(date, options);
        if (result.ok) {
          consecutiveFailures = 0;
          currentCooldownMs = baseCooldownMs;
          allCached = !!result.allCached;
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
          // 30min cap (not 15) — an overnight run should ride out a longer
          // BnF-side quota/penalty window rather than burning through
          // --max-consecutive-failures on a block that would've lifted by morning.
          currentCooldownMs = Math.min(currentCooldownMs * 2, 1_800_000);
        }
      }

      const hasMore = i < batch.length - 1;
      if (hasMore && delayBetweenDatesMs > 0) {
        if (allCached) {
          console.error(
            `[ingest-range] ${date}: all steps were cache hits — skipping inter-date delay.`,
          );
        } else {
          console.error(
            `[ingest-range] Waiting ${delaySeconds}s before next date…`,
          );
          await sleep(delayBetweenDatesMs);
        }
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
            (SKIP_CROP_STRIP ? " --skip-crop-strip" : "") +
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
