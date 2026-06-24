#!/usr/bin/env npx tsx
/**
 * scripts/gallica/ingest-all.ts
 *
 * Batch runner for the Gallica scan pipeline across all serialization dates
 * (or a filtered subset). Intended for long background runs.
 *
 * Usage:
 *   npx tsx scripts/gallica/ingest-all.ts
 *   npx tsx scripts/gallica/ingest-all.ts --skip-existing
 *   npx tsx scripts/gallica/ingest-all.ts --from=1844-08-28 --to=1844-10-19
 *   npx tsx scripts/gallica/ingest-all.ts --part=1 --steps=pull
 *   npx tsx scripts/gallica/ingest-all.ts --dry-run
 *
 * Steps (default: all):
 *   resolve  → scripts/gallica/resolve-issue.ts
 *   pull     → scripts/gallica/pull-scans.ts
 *   crop     → scripts/gallica/crop-strip.ts
 *
 * Pass --skip-existing to skip work already done (per-page for pull-scans).
 * On step failure, logs the error and continues to the next date unless
 * --stop-on-error is set.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  DRY_RUN,
  SKIP_EXISTING,
  filterInstallments,
  parseCliFromDate,
  parseCliToDate,
  parseCliPart,
  parseCliSteps,
} from "./_shared";

const STOP_ON_ERROR = process.argv.includes("--stop-on-error");
const ROOT = path.resolve(__dirname, "../..");

const STEP_SCRIPTS: Record<"resolve" | "pull" | "crop", string> = {
  resolve: "scripts/gallica/resolve-issue.ts",
  pull: "scripts/gallica/pull-scans.ts",
  crop: "scripts/gallica/crop-strip.ts",
};

function runStep(
  step: "resolve" | "pull" | "crop",
  date: string,
): { ok: boolean; code: number | null } {
  const script = STEP_SCRIPTS[step];
  const args = ["tsx", script, `--date=${date}`];
  if (DRY_RUN) args.push("--dry-run");
  if (SKIP_EXISTING) args.push("--skip-existing");

  console.log(`[ingest-all] ${date} → ${step}`);
  const result = spawnSync("npx", args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  return { ok: result.status === 0, code: result.status };
}

async function main() {
  const fromDate = parseCliFromDate();
  const toDate = parseCliToDate();
  const part = parseCliPart();
  const steps = parseCliSteps();
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
  if (SKIP_EXISTING) {
    console.log(
      "[ingest-all] --skip-existing enabled (per-page for pull-scans)",
    );
  }

  const failures: Array<{ date: string; step: string; code: number | null }> =
    [];
  let completed = 0;

  for (const inst of dates) {
    for (const step of ["resolve", "pull", "crop"] as const) {
      if (!steps.has(step)) continue;

      const { ok, code } = runStep(step, inst.date);
      if (!ok) {
        failures.push({ date: inst.date, step, code });
        console.error(
          `[ingest-all] FAILED ${inst.date} / ${step} (exit ${code ?? "?"})`,
        );
        if (STOP_ON_ERROR) {
          console.log(
            JSON.stringify({
              ok: false,
              completed,
              total: dates.length,
              failures,
              stopped: true,
            }),
          );
          process.exit(1);
        }
        break;
      }
    }
    completed++;
    console.log(
      `[ingest-all] Finished ${inst.date} (${completed}/${dates.length})`,
    );
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
