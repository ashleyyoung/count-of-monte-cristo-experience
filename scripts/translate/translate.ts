#!/usr/bin/env npx tsx
/**
 * scripts/translate/translate.ts
 *
 * Translate a full Journal des Débats issue from the stored French intermediate
 * and write the segmented English output to R2 + translation_versions.
 *
 * This script is the SINGLE WRITER for machine_claude translation_versions rows.
 * Reads the FR intermediate written by extract-text.ts (or re-fetches if not present).
 *
 * Usage:
 *   npx tsx scripts/translate/translate.ts --date=1844-08-28 [--dry-run]
 *
 * Recommended workflow:
 *   npx tsx scripts/translate/extract-text.ts --date=...
 *   npx tsx scripts/translate/translate.ts --date=...
 *   npx tsx scripts/translate/update-day-content.ts --date=...
 */

import "dotenv/config";
import {
  parseCliDate,
  DRY_RUN,
  makeSupabaseClient,
  loadDayDoc,
  logStructuredError,
} from "../gallica/_shared";
import {
  resolveIssueArk,
  fetchTexteBrut,
  texteBrutUrl,
  gallicaPermalink,
  DEBATS_PERIODICAL_ARK,
} from "../../lib/gallica";
import { getR2Text, putR2Text, isR2Configured } from "../../lib/r2-server";
import {
  translateAndSegment,
  getTranslationModel,
} from "../../lib/llm/translate";
import { ALL_SECTIONS, type SectionKey } from "../../lib/translate/pipeline";

// Section → the SegmentedTranslation field
function pickSection(
  seg: Awaited<ReturnType<typeof translateAndSegment>>["result"],
  section: SectionKey,
) {
  switch (section) {
    case "overview":
      return seg.overview;
    case "chapter":
      return seg.chapter;
    case "debats.music":
      return seg.debats?.music ?? null;
    case "debats.theater":
      return seg.debats?.theater ?? null;
    case "debats.art":
      return seg.debats?.art ?? null;
    case "debats.literature":
      return seg.debats?.literature ?? null;
    case "art_exhibitions":
      return seg.art_exhibitions;
    case "science":
      return seg.science;
    case "galignani":
      return seg.galignani;
  }
}

async function main() {
  const date = parseCliDate();
  console.error(
    `[translate] Processing ${date}${DRY_RUN ? " (dry-run)" : ""}…`,
  );
  console.error(`[translate] Model: ${getTranslationModel()}`);

  const supabase = makeSupabaseClient();
  const doc = await loadDayDoc(supabase, date);

  // -----------------------------------------------------------------------
  // Fetch FR source (from R2 cache or Gallica directly)
  // -----------------------------------------------------------------------
  const frCacheKey = `${date}/fr-intermediate/gallica-textebrut.txt`;
  let frenchText: string | null = null;
  let sourceTextUrl: string;
  let gallicaUrl: string;

  if (isR2Configured()) {
    frenchText = await getR2Text(frCacheKey);
    if (frenchText) {
      console.error(`[translate] Using cached FR intermediate from R2.`);
    }
  }

  if (!frenchText) {
    console.error(
      `[translate] No cached FR intermediate — fetching from Gallica…`,
    );
    const issueInfo = await resolveIssueArk(DEBATS_PERIODICAL_ARK, date);
    if (!issueInfo) {
      logStructuredError(
        { day: date, stage: "fetch_source" },
        new Error(`No Gallica issue found for ${date}.`),
      );
      process.exit(1);
    }
    const { ark } = issueInfo;
    frenchText = await fetchTexteBrut(ark);
    sourceTextUrl = texteBrutUrl(ark);
    gallicaUrl = gallicaPermalink(ark);

    if (!frenchText || frenchText.trim().length < 200) {
      logStructuredError(
        { day: date, stage: "fetch_source" },
        new Error(`texteBrut returned insufficient content for ${date}.`),
      );
      process.exit(1);
    }

    if (!DRY_RUN && isR2Configured()) {
      await putR2Text(frCacheKey, frenchText);
    }
  } else {
    // Reconstruct URLs from ARK to build gallica links
    const issueInfo = await resolveIssueArk(DEBATS_PERIODICAL_ARK, date);
    const ark = issueInfo?.ark ?? DEBATS_PERIODICAL_ARK;
    sourceTextUrl = texteBrutUrl(ark);
    gallicaUrl = gallicaPermalink(ark);
  }

  // -----------------------------------------------------------------------
  // Translate + segment
  // -----------------------------------------------------------------------
  console.error(`[translate] Sending to Claude (${getTranslationModel()})…`);
  const { result: segmented, usage } = await translateAndSegment(
    frenchText!,
    date,
  );
  console.error(
    `[translate] Done in ${(usage.duration_ms / 1000).toFixed(1)}s. ` +
      `Cost: $${usage.cost_usd.toFixed(4)} (${usage.tokens_in} in / ${usage.tokens_out} out).`,
  );

  // -----------------------------------------------------------------------
  // Write each section to R2 + insert translation_versions rows
  // -----------------------------------------------------------------------
  // Attribute the single whole-issue cost across sections that produced content
  // so per-row costs sum back to the run total.
  const producedCount = ALL_SECTIONS.filter((s) => {
    const r = pickSection(segmented, s);
    return r && r.text.trim().length > 0;
  }).length;
  const perSectionCost = producedCount > 0 ? usage.cost_usd / producedCount : 0;

  // Immutable, version-unique R2 key prefix so re-runs never overwrite a prior
  // version's English text (history compare relies on this).
  const runStamp = new Date().toISOString().replace(/[:.]/g, "-");

  const results: Array<{
    section: string;
    slot_key: string;
    status: "written" | "skipped" | "dry-run";
    low_confidence: boolean;
  }> = [];

  for (const section of ALL_SECTIONS) {
    const sectionResult = pickSection(segmented, section);

    if (!sectionResult || !sectionResult.text.trim()) {
      results.push({
        section,
        slot_key: `${section}-1`,
        status: "skipped",
        low_confidence: false,
      });
      continue;
    }

    // Find existing slot_key if re-running
    const existingItems = doc as Record<string, unknown>;
    let existingSlotKey: string | undefined;
    // Resolve the existing item's slot_key (simplified — we look in the doc object)
    const sectionItems = section.startsWith("debats.")
      ? ((existingItems.debats as Record<string, unknown>)?.[
          section.replace("debats.", "")
        ] as Array<Record<string, unknown>>)
      : (existingItems[section] as Array<Record<string, unknown>>);
    const firstText = (sectionItems ?? []).find((i) => i.kind === "text");
    existingSlotKey = firstText?.slot_key as string | undefined;

    const slotKey = existingSlotKey ?? `${section}-1`;
    const enKey = `${date}/en/${slotKey}/${runStamp}.txt`;

    if (!DRY_RUN) {
      if (isR2Configured()) {
        await putR2Text(enKey, sectionResult.text);
      }

      // Insert translation_versions row (single-writer)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("translation_versions")
        .insert({
          installment_date: date,
          section,
          slot_key: slotKey,
          text_r2_key: enKey,
          source: "Journal des Débats",
          original_date: date,
          gallica_url: gallicaUrl,
          license: "Public Domain",
          attribution: `Machine translation by ${usage.model}`,
          translation_origin: "machine_claude",
          model_used: usage.model,
          source_text_url: sourceTextUrl!,
          fr_intermediate_r2_key: frCacheKey,
          cost_usd: perSectionCost,
          low_confidence: sectionResult.low_confidence,
          admin_notes: sectionResult.admin_notes ?? null,
        });
      if (error) {
        logStructuredError(
          { day: date, stage: "write" },
          new Error(
            `translation_versions insert failed for ${section}: ${error.message}`,
          ),
        );
      }
    }

    results.push({
      section,
      slot_key: slotKey,
      status: DRY_RUN ? "dry-run" : "written",
      low_confidence: sectionResult.low_confidence,
    });
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  const written = results.filter((r) => r.status === "written").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const lowConf = results.filter((r) => r.low_confidence).length;

  console.log(
    JSON.stringify({
      date,
      model: usage.model,
      tokens_in: usage.tokens_in,
      tokens_out: usage.tokens_out,
      cost_usd: usage.cost_usd,
      duration_ms: usage.duration_ms,
      written,
      skipped,
      low_confidence_sections: lowConf,
      dry_run: DRY_RUN,
      sections: results,
    }),
  );
}

main().catch((err) => {
  console.error("[translate] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
