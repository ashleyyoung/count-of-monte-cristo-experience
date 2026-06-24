#!/usr/bin/env npx tsx
/**
 * scripts/parse-schedule.ts
 *
 * Parses monte-cristo-serialization-schedule.md into content/schedule.json,
 * then upserts the 139 rows into the Supabase `installments` table.
 *
 * Usage:
 *   npx tsx scripts/parse-schedule.ts
 *
 * Output:
 *   content/schedule.json
 */

import * as fs from "fs";
import * as path from "path";
import { parse as parseDate, format as formatDate, isValid } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Chapter {
  num: string; // Roman numeral, e.g. "XIV"
  title: string; // English title
  cont: boolean; // true if "(cont.)"
}

interface Installment {
  date: string;
  part: 1 | 2 | 3 | 4;
  part_index: number;
  global_index: number;
  label: string;
  chapters: Chapter[];
  is_hiatus_after: boolean;
}

interface SchedulePart {
  part: 1 | 2 | 3 | 4;
  label: string;
  date_range: string;
  chapter_range: string;
  installments: Installment[];
}

interface Schedule {
  total: number;
  parts: SchedulePart[];
  installments: Installment[];
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const MONTH_ABBR: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

function parseInstallmentDate(raw: string, currentYear: string): string {
  const parts = raw.trim().split(/\s+/);
  let day: string;
  let monthAbbr: string;
  let year = currentYear;

  if (parts.length === 3) {
    [day, monthAbbr, year] = parts;
  } else if (parts.length === 2) {
    [day, monthAbbr] = parts;
  } else {
    throw new Error(`Unrecognised date fragment: "${raw}"`);
  }

  const month = MONTH_ABBR[monthAbbr];
  if (!month) throw new Error(`Unknown month abbreviation: "${monthAbbr}"`);

  const d = parseDate(
    `${year}-${month}-${day.padStart(2, "0")}`,
    "yyyy-MM-dd",
    new Date(),
  );
  if (!isValid(d)) throw new Error(`Invalid date: "${raw}"`);
  return formatDate(d, "yyyy-MM-dd");
}

function parseChapters(label: string): Chapter[] {
  const segments = label
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);
  const chapters: Chapter[] = [];

  for (const seg of segments) {
    const m = seg.match(/^([IVXLCDM]+)\.\s+(.+?)(\s+\(cont\.\))?$/);
    if (!m) continue;
    const [, num, rawTitle, contMark] = m;
    chapters.push({
      num,
      title: rawTitle.replace(/\s+\(cont\.\)\s*$/, "").trim(),
      cont: Boolean(contMark),
    });
  }

  if (
    chapters.length === 0 &&
    segments.some((s) => s.toLowerCase().includes("cont."))
  ) {
    chapters.push({ num: "?", title: "(continuation)", cont: true });
  }

  return chapters;
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

function parseSchedule(mdText: string): Schedule {
  const lines = mdText.split("\n");

  const parts: SchedulePart[] = [];
  let currentPart: SchedulePart | null = null;
  let currentYear = "1844";
  let globalIndex = 0;

  const PART_HEADER = /^##\s+PART\s+(\d+)\s+—\s+(.+?)\s*$/;
  const TABLE_ROW = /^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/;
  const PART_DETAIL = /^\*\((.+?)\)\*\s*$/;

  for (const line of lines) {
    const partMatch = line.match(PART_HEADER);
    if (partMatch) {
      if (currentPart) parts.push(currentPart);
      const partNum = parseInt(partMatch[1]) as 1 | 2 | 3 | 4;
      const partDateRange = partMatch[2];

      const yearMatch = partDateRange.match(/\b(\d{4})\b/);
      if (yearMatch) currentYear = yearMatch[1];

      currentPart = {
        part: partNum,
        label: `Part ${partNum}: ${partDateRange}`,
        date_range: partDateRange,
        chapter_range: "",
        installments: [],
      };
      continue;
    }

    const detailMatch = line.match(PART_DETAIL);
    if (detailMatch && currentPart) {
      currentPart.chapter_range = detailMatch[1];
      continue;
    }

    if (!currentPart) continue;

    const rowMatch = line.match(TABLE_ROW);
    if (!rowMatch) continue;
    const [, dateCol, labelCol] = rowMatch;
    if (dateCol === "Date (1844)" || dateCol === "Date" || dateCol === "---") {
      continue;
    }

    const explicitYear = dateCol.match(/\b(18\d\d)\b/);
    if (explicitYear) currentYear = explicitYear[1];

    let isoDate: string;
    try {
      isoDate = parseInstallmentDate(dateCol.trim(), currentYear);
    } catch {
      console.warn(`  [warn] Could not parse date: "${dateCol}" — skipping`);
      continue;
    }

    globalIndex++;
    const label = labelCol.replace(/\s*—\s*\*Fin\.\*/, "").trim();

    currentPart.installments.push({
      date: isoDate,
      part: currentPart.part,
      part_index: currentPart.installments.length + 1,
      global_index: globalIndex,
      label,
      chapters: parseChapters(label),
      is_hiatus_after: false,
    });
  }

  if (currentPart) parts.push(currentPart);

  // Mark the last installment of Part 2 as the hiatus boundary.
  const part2 = parts.find((p) => p.part === 2);
  if (part2 && part2.installments.length > 0) {
    part2.installments[part2.installments.length - 1].is_hiatus_after = true;
  }

  const installments = parts.flatMap((p) => p.installments);
  console.log(
    `  Parsed ${installments.length} installments across ${parts.length} parts.`,
  );

  return { total: installments.length, parts, installments };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const root = path.resolve(__dirname, "..");
  const mdPath = path.join(root, "monte-cristo-serialization-schedule.md");
  const outDir = path.join(root, "content");
  const outPath = path.join(outDir, "schedule.json");

  console.log("Reading schedule from:", mdPath);
  const mdText = fs.readFileSync(mdPath, "utf-8");

  console.log("Parsing…");
  const schedule = parseSchedule(mdText);

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(schedule, null, 2), "utf-8");
  console.log(`Wrote ${outPath} (${schedule.total} installments)`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.log("SUPABASE_SERVICE_ROLE_KEY not set — skipping DB upsert.");
    return;
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceKey);

  const rows = schedule.installments.map((inst) => ({
    installment_date: inst.date,
    part: inst.part,
    part_index: inst.part_index,
    global_index: inst.global_index,
    label: inst.label,
    chapters: inst.chapters,
    is_hiatus_after: inst.is_hiatus_after,
  }));

  console.log(`Upserting ${rows.length} rows into installments…`);
  const { error: instError } = await supabase
    .from("installments")
    .upsert(rows, { onConflict: "installment_date" });

  if (instError) {
    console.error("Supabase upsert failed:", instError.message);
    process.exit(1);
  }

  const contentRows = rows.map((r) => ({
    installment_date: r.installment_date,
    doc: {
      gallica_issue_url: null,
      feuilleton_strip: null,
      original_pages: [],
      overview: [],
      chapter: [],
      debats: { music: [], theater: [], art: [], literature: [] },
      art_exhibitions: [],
      science: [],
      galignani: [],
    },
  }));

  const { error: contentError } = await supabase
    .from("day_content")
    .upsert(contentRows, {
      onConflict: "installment_date",
      ignoreDuplicates: true,
    });

  if (contentError) {
    console.error("day_content seed failed:", contentError.message);
    process.exit(1);
  }

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
