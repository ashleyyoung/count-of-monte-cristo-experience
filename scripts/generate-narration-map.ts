#!/usr/bin/env npx tsx
/**
 * scripts/generate-narration-map.ts
 *
 * Fetches the Archive.org metadata JSON for the two LibriVox recordings of
 * The Count of Monte Cristo and writes static chapter→URL mapping files to
 * content/narration/{en,fr}.json.
 *
 * These files are committed to the repo and imported at build time by
 * lib/narration.ts — no runtime network calls needed.
 *
 * Mapping logic:
 *   Each recording uses sequential filenames (_001_, _002_, …) that correspond
 *   directly to chapter numbers (1 = Chapter I, 2 = Chapter II, …). We extract
 *   the sequence number from the filename and convert it to a Roman numeral.
 *   Only chapters I–CXVII (1–117) are included; extras (intro, appendix) are
 *   ignored.
 *
 * Usage:
 *   npx tsx scripts/generate-narration-map.ts
 *
 * Output:
 *   content/narration/en.json  — { "I": "https://archive.org/download/...", ... }
 *   content/narration/fr.json  — same shape for the French recording
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SOURCES = [
  {
    lang: "en",
    identifier: "count_montecristo_1308_librivox",
    targetFormat: "VBR MP3",
    maxChapter: 117,
  },
  {
    lang: "fr",
    identifier: "comte_monte_cristo_jg_librivox",
    targetFormat: "VBR MP3",
    // Five chapters were split into two parts (031, 033, 044, 073, 077).
    // buildMap automatically picks the lowest sub-part (part 1).
    maxChapter: 117,
  },
] as const;

const OUT_DIR = path.resolve(__dirname, "../content/narration");

// ---------------------------------------------------------------------------
// Roman numeral conversion
// ---------------------------------------------------------------------------

function toRoman(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = [
    "M",
    "CM",
    "D",
    "CD",
    "C",
    "XC",
    "L",
    "XL",
    "X",
    "IX",
    "V",
    "IV",
    "I",
  ];
  let result = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) {
      result += syms[i];
      n -= vals[i];
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Archive.org metadata fetch
// ---------------------------------------------------------------------------

interface ArchiveFile {
  name: string;
  format: string;
  title?: string;
  track?: string;
  length?: string;
}

interface ArchiveMetadata {
  files: ArchiveFile[];
}

async function fetchMetadata(identifier: string): Promise<ArchiveMetadata> {
  const url = `https://archive.org/metadata/${identifier}`;
  console.log(`  Fetching: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Archive.org metadata fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  return res.json() as Promise<ArchiveMetadata>;
}

// ---------------------------------------------------------------------------
// Build map for one language
// ---------------------------------------------------------------------------

/**
 * For each chapter number, tracks all candidate files with their sub-part
 * index (0 = no sub-part, 1 = part 1, 2 = part 2, …). We then select the
 * file with the smallest sub-part, so "part 1" always wins over "part 2" for
 * chapters that were recorded in multiple pieces.
 */
interface Candidate {
  url: string;
  subPart: number; // 0 = no suffix, 1 = _1_, 2 = _2_, …
}

async function buildMap(
  identifier: string,
  targetFormat: string,
  maxChapter: number,
): Promise<Record<string, string>> {
  const meta = await fetchMetadata(identifier);

  const candidates = meta.files.filter((f) => f.format === targetFormat);
  console.log(`  ${targetFormat} files found: ${candidates.length}`);

  // Two patterns:
  //   primary:  _NNN_dumas (no sub-part)
  //   split:    _NNN_P_dumas (sub-part P)
  const primaryPat = /_(\d{3})_dumas/;
  const splitPat = /_(\d{3})_(\d+)_dumas/;

  // chapter number (int) → best candidate so far
  const best = new Map<number, Candidate>();
  const skipped: string[] = [];

  for (const file of candidates) {
    let seqNum: number;
    let subPart: number;

    const splitMatch = file.name.match(splitPat);
    if (splitMatch) {
      seqNum = parseInt(splitMatch[1], 10);
      subPart = parseInt(splitMatch[2], 10);
    } else {
      const primaryMatch = file.name.match(primaryPat);
      if (!primaryMatch) {
        skipped.push(file.name);
        continue;
      }
      seqNum = parseInt(primaryMatch[1], 10);
      subPart = 0;
    }

    if (seqNum < 1 || seqNum > maxChapter) {
      continue;
    }

    const url = `https://archive.org/download/${identifier}/${encodeURIComponent(file.name)}`;
    const existing = best.get(seqNum);
    if (!existing || subPart < existing.subPart) {
      best.set(seqNum, { url, subPart });
    }
  }

  if (skipped.length > 0) {
    console.log(`  Skipped ${skipped.length} files not matching any pattern`);
  }

  // Build final map keyed by Roman numeral, sorted by chapter number
  const map: Record<string, string> = {};
  for (const [seqNum, candidate] of [...best.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    map[toRoman(seqNum)] = candidate.url;
  }

  return map;
}

function romanToInt(s: string): number {
  const vals: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
    D: 500,
    M: 1000,
  };
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = vals[s[i]] ?? 0;
    const next = vals[s[i + 1]] ?? 0;
    total += cur < next ? -cur : cur;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const source of SOURCES) {
    console.log(`\n[${source.lang.toUpperCase()}] ${source.identifier}`);
    const map = await buildMap(
      source.identifier,
      source.targetFormat,
      source.maxChapter,
    );
    const count = Object.keys(map).length;
    console.log(`  Mapped ${count} chapters (expected ${source.maxChapter})`);

    if (count < source.maxChapter) {
      const missing: string[] = [];
      for (let i = 1; i <= source.maxChapter; i++) {
        const r = toRoman(i);
        if (!map[r]) missing.push(r);
      }
      console.warn(`  Missing chapters: ${missing.join(", ")}`);
    }

    const outPath = path.join(OUT_DIR, `${source.lang}.json`);
    fs.writeFileSync(outPath, JSON.stringify(map, null, 2) + "\n", "utf-8");
    console.log(`  Written: ${outPath}`);
  }

  console.log(
    "\nDone. Commit content/narration/en.json and content/narration/fr.json.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
