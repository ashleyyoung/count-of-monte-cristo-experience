#!/usr/bin/env npx tsx
/**
 * scripts/ingest-gutenberg.ts
 *
 * Downloads Project Gutenberg #1184 (The Count of Monte Cristo, English),
 * splits it into per-chapter text objects, uploads each to R2, and writes
 * the r2_key reference back into the `day_content.doc.chapter` array for
 * the installment(s) that introduced each chapter.
 *
 * Handles "(cont.)" installments: a chapter that spans multiple installments
 * has its full text on R2 keyed under the chapter number. Every installment
 * that introduced or continued that chapter gets a `text` item referencing
 * the same key. The reader can load the whole chapter from any installment
 * that mentions it.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/ingest-gutenberg.ts
 *   # Add --dry-run to skip R2 and Supabase writes.
 *
 * Environment variables (from .env):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_ENDPOINT_URL_S3, R2_BUCKET_NAME
 */

import scheduleData from "../content/schedule.json";
import type { Installment, Chapter } from "../lib/installments";
import { splitIntoChapters } from "../lib/gutenberg-split";
import { putR2Text } from "../lib/r2-server";
import { createClient } from "@supabase/supabase-js";

const GUTENBERG_URL = "https://www.gutenberg.org/files/1184/1184-0.txt";

const DRY_RUN = process.argv.includes("--dry-run");
const PROVENANCE = {
  source: "Project Gutenberg",
  gallica_url: "https://www.gutenberg.org/ebooks/1184",
  license: "Public Domain",
  attribution:
    "The Count of Monte Cristo by Alexandre Dumas — Project Gutenberg EBook #1184",
  original_date: "1844-08-28", // first serialization date; individual dates set per installment
};

// ---------------------------------------------------------------------------
// Download the Gutenberg text
// ---------------------------------------------------------------------------

async function downloadText(): Promise<string> {
  console.log("Downloading Gutenberg #1184…");
  const res = await fetch(GUTENBERG_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Gutenberg text`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Build mapping: chapter numRoman → installment dates
// ---------------------------------------------------------------------------

function buildChapterToInstallments(
  installments: Installment[],
): Map<string, Installment[]> {
  const map = new Map<string, Installment[]>();
  for (const inst of installments) {
    for (const ch of inst.chapters as Chapter[]) {
      const existing = map.get(ch.num) ?? [];
      existing.push(inst);
      map.set(ch.num, existing);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const raw = await downloadText();
  const chapters = splitIntoChapters(raw);
  console.log(`  Split into ${chapters.length} chapters.`);

  // Build install lookup
  const chapterToInstallments = buildChapterToInstallments(
    scheduleData.installments as Installment[],
  );

  // Track which day_content docs need updating: date → new chapter items to append
  const docUpdates = new Map<
    string,
    Array<{
      kind: "text";
      text_r2_key: string;
      source: string;
      original_date: string;
      gallica_url: string;
      license: string;
      attribution: string;
    }>
  >();

  for (const ch of chapters) {
    const r2Key = `gutenberg/chapters/${ch.numRoman.toUpperCase()}.txt`;

    if (!DRY_RUN) {
      const heading = `${ch.numRoman}. ${ch.title}\n\n`;
      await putR2Text(r2Key, heading + ch.body);
      process.stdout.write(`  ✓ R2: ${r2Key}\n`);
    } else {
      console.log(`  [dry-run] Would upload: ${r2Key}`);
    }

    // Find all installments that introduced or continued this chapter
    const installments = chapterToInstallments.get(ch.numRoman.toUpperCase());
    if (!installments || installments.length === 0) {
      console.warn(`  [warn] No installment found for chapter ${ch.numRoman}`);
      continue;
    }

    for (const inst of installments) {
      const item = {
        kind: "text" as const,
        text_r2_key: r2Key,
        source: PROVENANCE.source,
        original_date: inst.date,
        gallica_url: PROVENANCE.gallica_url,
        license: PROVENANCE.license,
        attribution: PROVENANCE.attribution,
      };
      const existing = docUpdates.get(inst.date) ?? [];
      // Avoid duplicate keys for the same chapter
      if (!existing.some((i) => i.text_r2_key === r2Key)) {
        existing.push(item);
      }
      docUpdates.set(inst.date, existing);
    }
  }

  if (DRY_RUN) {
    console.log(
      `[dry-run] Would update day_content for ${docUpdates.size} installments.`,
    );
    return;
  }

  // Fetch existing day_content docs and merge chapter items in
  console.log(`Updating day_content for ${docUpdates.size} installments…`);
  let updated = 0;

  for (const [date, newItems] of docUpdates) {
    const { data: existing, error: fetchErr } = await supabase
      .from("day_content")
      .select("doc")
      .eq("installment_date", date)
      .single();

    if (fetchErr) {
      console.warn(
        `  [warn] Could not fetch day_content for ${date}: ${fetchErr.message}`,
      );
      continue;
    }

    const doc = (existing?.doc ?? {}) as Record<string, unknown>;
    const existingChapter = (doc.chapter ?? []) as Array<
      (typeof newItems)[number] & { translation_origin?: string }
    >;

    // The novel's text is the public-domain Gutenberg edition, never the OCR'd
    // feuilleton: drop any machine-translated chapter items before merging so a
    // re-run heals days that were snapshotted from the paper.
    const merged = existingChapter.filter(
      (e) => e.translation_origin !== "machine_claude",
    );
    for (const item of newItems) {
      if (!merged.some((e) => e.text_r2_key === item.text_r2_key)) {
        merged.push(item);
      }
    }

    doc.chapter = merged;

    const { error: updateErr } = await supabase
      .from("day_content")
      .update({ doc, updated_at: new Date().toISOString() })
      .eq("installment_date", date);

    if (updateErr) {
      console.error(`  [error] Failed to update ${date}: ${updateErr.message}`);
    } else {
      updated++;
    }
  }

  console.log(
    `Done. Updated ${updated} / ${docUpdates.size} day_content rows.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
