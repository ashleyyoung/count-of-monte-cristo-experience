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

import {
  resolveIssueArk,
  gallicaPermalink,
  DEBATS_PERIODICAL_ARK,
} from "../../lib/gallica";
import {
  makeSupabaseClient,
  loadDayDoc,
  saveDayDoc,
  parseCliDate,
  DRY_RUN,
  logStructuredError,
} from "./_shared";

async function main() {
  const day = parseCliDate();
  const supabase = makeSupabaseClient();

  // ── 1. Resolve issue ARK via Gallica Issues + Pagination services ──
  let ark: string;
  let pageCount: number;
  try {
    const result = await resolveIssueArk(DEBATS_PERIODICAL_ARK, day);
    if (!result) {
      logStructuredError(
        { day, stage: "resolve-issue" },
        new Error(`No Gallica issue found for Journal des Débats on ${day}`),
      );
      process.exit(1);
    }
    ark = result.ark;
    pageCount = result.pageCount;
  } catch (err) {
    logStructuredError({ day, stage: "resolve-issue" }, err);
    process.exit(1);
  }

  const gallicaUrl = gallicaPermalink(ark);

  // ── 2. Load existing doc, update gallica_issue_url, save ──
  let doc;
  try {
    doc = await loadDayDoc(supabase, day);
  } catch (err) {
    logStructuredError({ day, stage: "load-doc" }, err);
    process.exit(1);
  }

  doc.gallica_issue_url = gallicaUrl;

  try {
    await saveDayDoc(supabase, day, doc, DRY_RUN);
  } catch (err) {
    logStructuredError({ day, stage: "save-doc" }, err);
    process.exit(1);
  }

  console.log(
    JSON.stringify({ day, ark, pageCount, gallicaUrl, dryRun: DRY_RUN }),
  );
}

main().catch((err) => {
  console.error("[resolve-issue] Unexpected error:", err);
  process.exit(1);
});
