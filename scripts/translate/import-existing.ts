#!/usr/bin/env npx tsx
/**
 * scripts/translate/import-existing.ts
 *
 * Harvest curated human and public-domain translations and import them as
 * translation_versions rows with translation_origin = "existing_published".
 *
 * This is the SINGLE WRITER for existing_published rows.
 * It writes English text to R2 and inserts version rows for admin review.
 * update-day-content.ts will then select the live item (preferring existing_published).
 *
 * Supported sources (add more as they are confirmed):
 *
 *   SOURCE 1: hberlioz.com — Berlioz feuilletons (music criticism, debats.music)
 *             Translated by Michel Austin and Monir Tayeb.
 *             License: permission granted by hberlioz.com for non-commercial use;
 *             full credit required. Do NOT embed texts for which only linking is permitted.
 *
 *   SOURCE 2: Project Gutenberg #1184 — The Count of Monte Cristo (chapter)
 *             Anon. translation (Chapman & Hall, 1846). Public Domain.
 *             NOTE: ingest-gutenberg.ts handles the chapter ingestion separately.
 *             This script links to that work but does not re-ingest Gutenberg chapters.
 *
 * Usage:
 *   # Import all sources for a date
 *   npx tsx scripts/translate/import-existing.ts --date=1844-08-28
 *
 *   # Import a specific source
 *   npx tsx scripts/translate/import-existing.ts --date=1844-08-28 --source=berlioz
 *
 * Flags:
 *   --date=YYYY-MM-DD  (required)
 *   --source=berlioz|gutenberg|all  (default: all)
 *   --dry-run          (print what would be done without writing)
 */

import "dotenv/config";
import {
  parseCliDate,
  DRY_RUN,
  makeSupabaseClient,
  logStructuredError,
} from "../gallica/_shared";
import { putR2Text, isR2Configured } from "../../lib/r2-server";

// ---------------------------------------------------------------------------
// CLI arg parsing
// ---------------------------------------------------------------------------

function parseSource(): "berlioz" | "gutenberg" | "all" {
  const arg = process.argv.find((a) => a.startsWith("--source="));
  if (!arg) return "all";
  const val = arg.replace("--source=", "");
  if (val !== "berlioz" && val !== "gutenberg" && val !== "all") {
    throw new Error(
      `Invalid --source value: "${val}". Must be berlioz, gutenberg, or all.`,
    );
  }
  return val;
}

// ---------------------------------------------------------------------------
// Berlioz feuilleton importer (hberlioz.com)
// ---------------------------------------------------------------------------

/**
 * hberlioz.com Berlioz feuilleton index for the Débats music criticism.
 *
 * Index page: https://www.hberlioz.com/Feuilletons/BerliozFeuilletons.html
 * Each feuilleton has a page URL with the date and translated text.
 *
 * License: The translations by Michel Austin are published with permission
 * for non-commercial educational use. Attribution is required.
 * See: https://www.hberlioz.com/about.html
 */

interface BerliozEntry {
  date: string; // ISO date of the Débats issue
  url: string; // hberlioz.com page for this feuilleton
  translator: string; // "Michel Austin" or "Monir Tayeb"
  title?: string; // feuilleton title if known
}

/**
 * Mapping of known Débats music feuilleton dates to hberlioz.com pages.
 *
 * This list is populated manually as we verify entries.
 * TODO: Add more dates from the 1844-46 period as they are confirmed.
 */
const BERLIOZ_FEUILLETON_INDEX: BerliozEntry[] = [
  // Example entries — verify URLs before importing:
  // {
  //   date: "1844-08-28",
  //   url: "https://www.hberlioz.com/Feuilletons/BDF1844.html",
  //   translator: "Michel Austin",
  // },
  // The full index is at https://www.hberlioz.com/Feuilletons/BerliozFeuilletons.html
  // Dates from 1844-1847 cover our serialization window.
];

/** Scrape the English translation text from an hberlioz.com feuilleton page. */
async function fetchBerliozTranslation(entry: BerliozEntry): Promise<string> {
  const res = await fetch(entry.url, {
    headers: {
      "User-Agent": "Montecristo-Archive/1.0 (non-commercial research)",
    },
  });
  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} fetching ${entry.url}: ${res.statusText}`,
    );
  }
  const html = await res.text();

  // hberlioz.com pages embed the English text in <div class="text"> or similar.
  // Extract between common wrapper patterns.
  // This is a best-effort extraction — manual review recommended.
  const patterns = [
    /<div[^>]*class="[^"]*english[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class="[^"]*translation[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*id="[^"]*english[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      // Strip HTML tags and normalize whitespace
      return match[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  throw new Error(
    `Could not extract English translation text from ${entry.url}. ` +
      `The page structure may have changed — inspect manually and update the extractor.`,
  );
}

async function importBerlioz(
  date: string,
  supabase: ReturnType<typeof makeSupabaseClient>,
): Promise<{ imported: number; skipped: number }> {
  const entry = BERLIOZ_FEUILLETON_INDEX.find((e) => e.date === date);

  if (!entry) {
    console.error(
      `[import-existing] No Berlioz feuilleton entry for ${date}. ` +
        `Add the URL to BERLIOZ_FEUILLETON_INDEX if one exists.`,
    );
    return { imported: 0, skipped: 1 };
  }

  console.error(
    `[import-existing] Fetching Berlioz feuilleton from ${entry.url}…`,
  );
  const englishText = await fetchBerliozTranslation(entry);

  const slotKey = "debats.music-1";
  const r2Key = `${date}/en/existing/${slotKey}.txt`;
  const attribution = `Trans. ${entry.translator} (hberlioz.com)`;
  const license = "Non-commercial use with attribution (hberlioz.com)";

  if (!DRY_RUN) {
    if (!isR2Configured()) {
      throw new Error(
        "R2 is not configured. Cannot write Berlioz translation.",
      );
    }
    await putR2Text(r2Key, englishText);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("translation_versions")
      .insert({
        installment_date: date,
        section: "debats.music",
        slot_key: slotKey,
        text_r2_key: r2Key,
        source: "Journal des Débats",
        original_date: date,
        gallica_url: `https://gallica.bnf.fr/ark:/12148/cb39294634r/date${date.slice(0, 4)}`,
        license,
        attribution,
        translation_origin: "existing_published",
        model_used: null,
        translator: entry.translator,
        translation_source_url: entry.url,
        source_text_url: null,
        fr_intermediate_r2_key: null,
        cost_usd: null,
        low_confidence: false,
        admin_notes: null,
      });

    if (error) {
      throw new Error(
        `translation_versions insert failed for berlioz/${date}: ${error.message}`,
      );
    }

    console.error(
      `[import-existing] Berlioz feuilleton imported for ${date}: ${r2Key}`,
    );
  } else {
    console.error(
      `[dry-run] Would import Berlioz feuilleton for ${date}: ${r2Key}`,
    );
  }

  return { imported: 1, skipped: 0 };
}

// ---------------------------------------------------------------------------
// Project Gutenberg chapter (pointer only — ingest-gutenberg.ts is the writer)
// ---------------------------------------------------------------------------

async function importGutenberg(
  date: string,
): Promise<{ imported: number; skipped: number }> {
  // The Gutenberg chapter is ingested separately by scripts/ingest-gutenberg.ts.
  // That script writes the chapter TextItem directly to day_content.doc with
  // translation_origin: "existing_published".
  // This function exists as a placeholder to document the source and confirm
  // the chapter is handled.
  console.error(
    `[import-existing] Gutenberg chapter for ${date}: handled by scripts/ingest-gutenberg.ts. ` +
      `Run that script to ensure the chapter text is present in day_content.doc.`,
  );
  return { imported: 0, skipped: 1 };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const date = parseCliDate();
  const source = parseSource();
  console.error(
    `[import-existing] Processing ${date}, source=${source}${DRY_RUN ? " (dry-run)" : ""}…`,
  );

  const supabase = makeSupabaseClient();
  let totalImported = 0;
  let totalSkipped = 0;

  if (source === "berlioz" || source === "all") {
    try {
      const { imported, skipped } = await importBerlioz(date, supabase);
      totalImported += imported;
      totalSkipped += skipped;
    } catch (err) {
      logStructuredError({ day: date, stage: "fetch_source" }, err);
    }
  }

  if (source === "gutenberg" || source === "all") {
    const { imported, skipped } = await importGutenberg(date);
    totalImported += imported;
    totalSkipped += skipped;
  }

  console.log(
    JSON.stringify({
      date,
      source,
      imported: totalImported,
      skipped: totalSkipped,
      dry_run: DRY_RUN,
    }),
  );
}

main().catch((err) => {
  console.error(
    "[import-existing] Fatal:",
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
});
