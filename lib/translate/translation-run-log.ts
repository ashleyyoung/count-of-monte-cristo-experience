import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const LOG_TAIL_MAX_CHARS = 200_000;

/** Relative path (from repo root) for a local translation run log file. */
export function translationRunLogPath(date: string, runId: string): string {
  return `logs/translation/${date}-${runId}.log`;
}

function isValidRunDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidRunId(runId: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    runId,
  );
}

function resolveTranslationRunLogAbs(
  date: string,
  runId: string,
  cwd = process.cwd(),
): string | null {
  if (!isValidRunDate(date) || !isValidRunId(runId)) return null;
  const abs = path.resolve(cwd, translationRunLogPath(date, runId));
  const logsDir = path.resolve(cwd, "logs", "translation");
  if (!abs.startsWith(logsDir + path.sep)) return null;
  return abs;
}

/** Read the log file for a local translation run, or null if missing/invalid. */
export function readTranslationRunLog(
  date: string,
  runId: string,
  cwd = process.cwd(),
): string | null {
  const abs = resolveTranslationRunLogAbs(date, runId, cwd);
  if (!abs || !existsSync(abs)) return null;
  const content = readFileSync(abs, "utf8");
  if (content.length <= LOG_TAIL_MAX_CHARS) return content;
  return `…${content.slice(-LOG_TAIL_MAX_CHARS)}`;
}
