/**
 * lib/galignani/structure-ocr.ts
 *
 * Line-level classifier for cleaned Galignani ALTO OCR. Converts newline-
 * delimited text into typed blocks for structured rendering.
 */

export type GalignaniBlockType =
  | "heading"
  | "dateline"
  | "ad_lead"
  | "blockquote"
  | "footer"
  | "paragraph";

export interface GalignaniBlock {
  type: GalignaniBlockType;
  text: string;
}

const DATELINE_START = /^PARIS,\s+[A-Z]+\s+\d{1,2},?\s+\d{4}\.?/;

const AD_LEAD_MARKERS = [
  "WANTED,",
  "WANTS A PLACE,",
  "FOR SALE,",
  "ON SALE,",
] as const;

const FOOTER_START = /^(LE GERANT\.|Printed by|Published,?\s+By\s+Galignani)/i;

const BLOCKQUOTE_START = /^["\u201c]/;

const DATELINE_MAX_LEN = 120;
const AD_LEAD_SCAN_CHARS = 50;

function uppercaseLetterRatio(line: string): number {
  const letters = line.match(/[A-Za-zÀ-ſ]/g);
  if (!letters || letters.length === 0) return 0;
  const upper = letters.filter(
    (c) => c === c.toUpperCase() && c !== c.toLowerCase(),
  ).length;
  return upper / letters.length;
}

function countWholeWords(line: string): number {
  return (line.match(/\b[A-Za-zÀ-ſ]{4,}\b/g) ?? []).length;
}

function classifyLine(line: string): GalignaniBlockType {
  const trimmed = line.trim();
  if (!trimmed) return "paragraph";

  if (FOOTER_START.test(trimmed)) return "footer";

  if (DATELINE_START.test(trimmed) && trimmed.length < DATELINE_MAX_LEN) {
    return "dateline";
  }

  const head = trimmed.slice(0, AD_LEAD_SCAN_CHARS).toUpperCase();
  for (const marker of AD_LEAD_MARKERS) {
    if (head.includes(marker)) return "ad_lead";
  }

  if (BLOCKQUOTE_START.test(trimmed)) return "blockquote";

  const len = trimmed.length;
  if (
    len >= 8 &&
    len <= 80 &&
    uppercaseLetterRatio(trimmed) >= 0.8 &&
    countWholeWords(trimmed) >= 1
  ) {
    return "heading";
  }

  return "paragraph";
}

function lacksTerminalPunctuation(text: string): boolean {
  return !/[.?!]["'\u201d\u2019)]*$/.test(text.trimEnd());
}

function shouldMergeWithNext(current: string, next: string): boolean {
  if (!lacksTerminalPunctuation(current)) return false;
  const nextTrim = next.trimStart();
  if (!nextTrim) return false;
  const first = nextTrim[0];
  return first === first.toLowerCase() && first !== first.toUpperCase();
}

function mergeAdjacentBlocks(blocks: GalignaniBlock[]): GalignaniBlock[] {
  const out: GalignaniBlock[] = [];

  for (const block of blocks) {
    const prev = out[out.length - 1];
    const canMergeSame =
      prev &&
      prev.type === block.type &&
      (prev.type === "paragraph" || prev.type === "blockquote");
    const canMergeQuoteContinuation =
      prev &&
      prev.type === "blockquote" &&
      block.type === "paragraph" &&
      shouldMergeWithNext(prev.text, block.text);

    if (canMergeSame && shouldMergeWithNext(prev.text, block.text)) {
      prev.text = `${prev.text} ${block.text.trimStart()}`;
    } else if (canMergeQuoteContinuation) {
      prev.text = `${prev.text} ${block.text.trimStart()}`;
    } else {
      out.push({ ...block });
    }
  }

  return out;
}

/** Classify cleaned OCR lines into renderable blocks. */
export function structureGalignaniOcr(cleaned: string): GalignaniBlock[] {
  if (!cleaned.trim()) return [];

  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const classified: GalignaniBlock[] = lines.map((line) => ({
    type: classifyLine(line),
    text: line,
  }));

  return mergeAdjacentBlocks(classified);
}
