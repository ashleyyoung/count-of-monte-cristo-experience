/**
 * scripts/gallica/_shared.ts
 *
 * Shared utilities for the Gallica ingestion scripts.
 * Internal to scripts/gallica/ — do not import elsewhere.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  resolveIssueArk,
  parseArkFromGallicaUrl,
  gallicaPermalink,
  DEBATS_PERIODICAL_ARK,
  DEBATS_DEFAULT_PAGE_COUNT,
  type GallicaCacheOptions,
} from "../../lib/gallica";
import { getAll, type Installment } from "../../lib/installments";
import { parseDayDoc, type DayDoc } from "../../lib/types/content";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

// ---------------------------------------------------------------------------
// Env validation
// ---------------------------------------------------------------------------

export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

// ---------------------------------------------------------------------------
// Supabase admin client (service role — bypasses RLS)
// ---------------------------------------------------------------------------

export function makeSupabaseClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// day_content helpers
// ---------------------------------------------------------------------------

export async function loadDayDoc(
  supabase: ReturnType<typeof makeSupabaseClient>,
  isoDate: string,
): Promise<DayDoc> {
  const { data, error } = await supabase
    .from("day_content")
    .select("doc")
    .eq("installment_date", isoDate)
    .single();
  if (error && error.code !== "PGRST116") {
    // PGRST116 = row not found — treat as empty doc
    throw new Error(`Supabase read failed for ${isoDate}: ${error.message}`);
  }
  return parseDayDoc(data?.doc ?? {});
}

export async function saveDayDoc(
  supabase: ReturnType<typeof makeSupabaseClient>,
  isoDate: string,
  doc: DayDoc,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    console.log("[dry-run] Would upsert day_content.doc for", isoDate);
    return;
  }
  const { error } = await supabase
    .from("day_content")
    .upsert(
      { installment_date: isoDate, doc },
      { onConflict: "installment_date" },
    );
  if (error)
    throw new Error(`Supabase upsert failed for ${isoDate}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// media_assets helpers
// ---------------------------------------------------------------------------

export interface MediaAssetInsert {
  kind: string;
  title: string;
  caption: string;
  source: string;
  source_url: string;
  iiif_region: string | null;
  license: string;
  attribution: string;
  r2_key: string;
  download_blocked: boolean;
}

export async function insertMediaAsset(
  supabase: ReturnType<typeof makeSupabaseClient>,
  asset: MediaAssetInsert,
  dryRun: boolean,
): Promise<string> {
  if (dryRun) {
    const fakeId = `dry-run-${Date.now()}`;
    console.log(
      "[dry-run] Would insert media_asset:",
      asset.r2_key,
      "→ id:",
      fakeId,
    );
    return fakeId;
  }
  const { data, error } = await supabase
    .from("media_assets")
    .insert({ ...asset, tags: [] })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Error(
      `media_assets insert failed: ${error?.message ?? "no data"}`,
    );
  }
  return data.id as string;
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

/** Parse --date=YYYY-MM-DD from argv. Throws if missing or malformed. */
export function parseCliDate(): string {
  const arg = process.argv.find((a) => a.startsWith("--date="));
  if (!arg) {
    throw new Error("Required flag: --date=YYYY-MM-DD");
  }
  const date = arg.replace("--date=", "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
  }
  return date;
}

/** Parse an optional --page=N flag. Returns undefined if not provided. */
export function parseCliPage(): number | undefined {
  const arg = process.argv.find((a) => a.startsWith("--page="));
  if (!arg) return undefined;
  const n = parseInt(arg.replace("--page=", ""), 10);
  if (isNaN(n) || n < 1) throw new Error(`Invalid --page value: ${arg}`);
  return n;
}

/** Parse an optional --region=x,y,w,h flag for manual feuilleton region override. */
export function parseCliRegion():
  | { x: number; y: number; w: number; h: number }
  | undefined {
  const arg = process.argv.find((a) => a.startsWith("--region="));
  if (!arg) return undefined;
  const parts = arg.replace("--region=", "").split(",").map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    throw new Error(
      `Invalid --region format. Expected x,y,w,h (integers). Got: ${arg}`,
    );
  }
  const [x, y, w, h] = parts;
  return { x, y, w, h };
}

export const DRY_RUN = process.argv.includes("--dry-run");
export const SKIP_EXISTING = process.argv.includes("--skip-existing");
export const REFRESH_GALLICA_CACHE = process.argv.includes(
  "--refresh-gallica-cache",
);

/** Shared options for exported Gallica step runners (ingest-all + CLIs). */
export interface GallicaStepOptions {
  day: string;
  dryRun?: boolean;
  skipExisting?: boolean;
  refreshGallicaCache?: boolean;
}

export const DEFAULT_DELAY_BETWEEN_DATES_MS = 60_000;
export const DEFAULT_COOLDOWN_ON_ERROR_MS = 300_000;
export const DEFAULT_MAX_CONSECUTIVE_FAILURES = 5;
export const DEFAULT_RETRY_PASS_PAUSE_MS = 600_000;

/** Parse --delay-between-dates=N (seconds). Default 60. */
export function parseCliDelayBetweenDates(): number {
  return parseCliPositiveIntFlag("--delay-between-dates=", 60) * 1_000;
}

/** Parse --cooldown-on-error=N (seconds). Default 300 (5 min). */
export function parseCliCooldownOnError(): number {
  return parseCliPositiveIntFlag("--cooldown-on-error=", 300) * 1_000;
}

/** Parse --max-consecutive-failures=N. Default 5. */
export function parseCliMaxConsecutiveFailures(): number {
  return parseCliPositiveIntFlag("--max-consecutive-failures=", 5);
}

function parseCliPositiveIntFlag(prefix: string, defaultValue: number): number {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) return defaultValue;
  const n = parseInt(arg.replace(prefix, ""), 10);
  if (isNaN(n) || n < 0) {
    throw new Error(`Invalid flag value: ${arg}`);
  }
  return n;
}

/** Parse an optional --from=YYYY-MM-DD flag. */
export function parseCliFromDate(): string | undefined {
  return parseOptionalIsoDateFlag("--from=");
}

/** Parse an optional --to=YYYY-MM-DD flag. */
export function parseCliToDate(): string | undefined {
  return parseOptionalIsoDateFlag("--to=");
}

/** Parse an optional --part=N flag (1–4). */
export function parseCliPart(): number | undefined {
  const arg = process.argv.find((a) => a.startsWith("--part="));
  if (!arg) return undefined;
  const n = parseInt(arg.replace("--part=", ""), 10);
  if (isNaN(n) || n < 1 || n > 4) {
    throw new Error(`Invalid --part value: ${arg}. Expected 1–4.`);
  }
  return n;
}

/**
 * Parse --steps=resolve,pull,crop (default: all three).
 * Aliases: resolve-issue → resolve, pull-scans → pull, crop-strip → crop.
 */
export function parseCliSteps(): Set<"resolve" | "pull" | "crop"> {
  const arg = process.argv.find((a) => a.startsWith("--steps="));
  const raw = arg ? arg.replace("--steps=", "") : "resolve,pull,crop";
  const aliases: Record<string, "resolve" | "pull" | "crop"> = {
    resolve: "resolve",
    "resolve-issue": "resolve",
    pull: "pull",
    "pull-scans": "pull",
    crop: "crop",
    "crop-strip": "crop",
    all: "resolve", // placeholder; handled below
  };

  if (raw === "all") {
    return new Set(["resolve", "pull", "crop"]);
  }

  const steps = new Set<"resolve" | "pull" | "crop">();
  for (const token of raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const step = aliases[token];
    if (!step) {
      throw new Error(
        `Invalid --steps token: ${token}. Use resolve, pull, crop (comma-separated).`,
      );
    }
    steps.add(step);
  }
  if (steps.size === 0) {
    throw new Error("--steps must include at least one of resolve, pull, crop");
  }
  return steps;
}

function parseOptionalIsoDateFlag(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (!arg) return undefined;
  const date = arg.replace(prefix, "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
  }
  return date;
}

/** Installments from schedule.json, optionally filtered by CLI flags. */
export function filterInstallments(
  fromDate?: string,
  toDate?: string,
  part?: number,
): Installment[] {
  return getAll().filter((inst) => {
    if (fromDate && inst.date < fromDate) return false;
    if (toDate && inst.date > toDate) return false;
    if (part !== undefined && inst.part !== part) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Structured error logging
// ---------------------------------------------------------------------------

export interface GallicaErrorContext {
  day: string;
  page?: number;
  stage: string;
}

/** Log a structured error with context. Always logs to stderr. */
export function logStructuredError(
  ctx: GallicaErrorContext,
  err: unknown,
): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(JSON.stringify({ error: true, ...ctx, message }));
}

// ---------------------------------------------------------------------------
// Rate-limit sleep
// ---------------------------------------------------------------------------

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Default delay between IIIF full/full downloads to respect Gallica rate limit (5/min). */
export const IIIF_FULL_DELAY_MS = 13_000;

/** Default delay between texteBrut calls (5/min). */
export const TEXTEBRUT_DELAY_MS = 13_000;

/** Polite delay between ALTO / Pagination calls (~1/s). */
export const ALTO_DELAY_MS = 1_200;

// ---------------------------------------------------------------------------
// Issue resolution from day_content (avoids redundant Gallica API calls)
// ---------------------------------------------------------------------------

/**
 * Resolve ark + page count for a day. Uses doc.gallica_issue_url when present
 * (no Issues/Pagination API). Falls back to resolveIssueArk when URL missing.
 */
export async function resolveIssueForDay(
  day: string,
  doc: DayDoc,
  options: GallicaCacheOptions = {},
): Promise<{ ark: string; pageCount: number; gallicaUrl: string }> {
  const parsedArk = doc.gallica_issue_url
    ? parseArkFromGallicaUrl(doc.gallica_issue_url)
    : null;

  if (parsedArk && doc.gallica_issue_url) {
    return {
      ark: parsedArk,
      pageCount: doc.gallica_page_count ?? DEBATS_DEFAULT_PAGE_COUNT,
      gallicaUrl: doc.gallica_issue_url,
    };
  }

  const result = await resolveIssueArk(DEBATS_PERIODICAL_ARK, day, options);
  if (!result) {
    throw new Error(`No Gallica issue found for Journal des Débats on ${day}`);
  }

  return {
    ark: result.ark,
    pageCount: result.pageCount,
    gallicaUrl: gallicaPermalink(result.ark),
  };
}

/**
 * Run `main()` only when this file is the CLI entry point (not when imported).
 * Gallica step modules export `runX` for ingest-all / ingest-day; without this
 * guard, `import "./pull-scans"` would re-run pull-scans with process.argv.
 */
export function runCliMain(
  importMetaUrl: string,
  main: () => Promise<void>,
  label: string,
): void {
  const entry = process.argv[1];
  if (!entry) return;
  const scriptPath = fileURLToPath(importMetaUrl);
  if (path.resolve(scriptPath) !== path.resolve(entry)) return;
  main().catch((err) => {
    console.error(`[${label}] Unexpected error:`, err);
    process.exit(1);
  });
}
