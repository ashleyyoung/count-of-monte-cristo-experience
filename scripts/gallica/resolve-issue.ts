#!/usr/bin/env npx tsx
/**
 * scripts/gallica/resolve-issue.ts
 *
 * Given a serialization date, look up the Journal des Débats issue on Gallica,
 * confirm its page count, and write `doc.gallica_issue_url` back into the
 * matching `day_content` row.
 *
 * Usage:
 *   npx tsx scripts/gallica/resolve-issue.ts --date=1844-08-28
 *   npx tsx scripts/gallica/resolve-issue.ts --date=1844-08-28 --dry-run
 *
 * Environment (from .env or shell):
 *   NEXT_PUBLIC_SUPABASE_URL   – Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  – service-role key (bypasses RLS)
 *
 * Output:
 *   On success: JSON summary { day, ark, pageCount, gallicaUrl }
 *   On failure: JSON error   { error, day, stage, message }  →  exits 1
 */

import "dotenv/config";
import {
  resolveIssueArk,
  gallicaPermalink,
  DEBATS_PERIODICAL_ARK,
  type GallicaCacheOptions,
} from "../../lib/gallica";
import {
  makeSupabaseClient,
  loadDayDoc,
  saveDayDoc,
  parseCliDate,
  DRY_RUN,
  REFRESH_GALLICA_CACHE,
  logStructuredError,
  runCliMain,
  type GallicaStepOptions,
} from "./_shared";

export interface ResolveIssueResult {
  day: string;
  ark: string;
  pageCount: number;
  gallicaUrl: string;
  dryRun: boolean;
}

export async function runResolveIssue(
  options: GallicaStepOptions,
): Promise<ResolveIssueResult> {
  const { day, dryRun = false, refreshGallicaCache = false } = options;
  const cacheOptions: GallicaCacheOptions = { refresh: refreshGallicaCache };
  const supabase = makeSupabaseClient();

  const result = await resolveIssueArk(
    DEBATS_PERIODICAL_ARK,
    day,
    cacheOptions,
  );
  if (!result) {
    throw new Error(`No Gallica issue found for Journal des Débats on ${day}`);
  }

  const { ark, pageCount } = result;
  const gallicaUrl = gallicaPermalink(ark);

  const doc = await loadDayDoc(supabase, day);
  doc.gallica_issue_url = gallicaUrl;
  doc.gallica_page_count = pageCount;
  await saveDayDoc(supabase, day, doc, dryRun);

  return { day, ark, pageCount, gallicaUrl, dryRun };
}

const HELP = `resolve-issue — find the Gallica issue ARK for a date

Writes: doc.gallica_issue_url + doc.gallica_page_count on the day_content row
Next:   npx tsx scripts/gallica/pull-scans.ts --date=YYYY-MM-DD --skip-existing

Usage:
  npx tsx scripts/gallica/resolve-issue.ts --date=YYYY-MM-DD`;

async function main() {
  if (process.argv.includes("--help")) {
    console.log(HELP);
    return;
  }
  const day = parseCliDate();
  console.error(`[resolve-issue] ${day}: resolving Gallica issue ARK`);
  try {
    const summary = await runResolveIssue({
      day,
      dryRun: DRY_RUN,
      refreshGallicaCache: REFRESH_GALLICA_CACHE,
    });
    console.log(JSON.stringify(summary));
    console.error(
      `[resolve-issue] Done. ARK ${summary.ark} (${summary.pageCount} page(s)). ` +
        `Next: npx tsx scripts/gallica/pull-scans.ts --date=${day} --skip-existing`,
    );
  } catch (err) {
    logStructuredError({ day, stage: "resolve-issue" }, err);
    process.exit(1);
  }
}

runCliMain(import.meta.url, main, "resolve-issue");
