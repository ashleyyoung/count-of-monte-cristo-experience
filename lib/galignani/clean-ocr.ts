/**
 * lib/galignani/clean-ocr.ts
 *
 * Token-free, deterministic cleanup for the raw ALTO OCR we pull from Gallica
 * for Galignani's Messenger (see scripts/gallica/pull-galignani.ts).
 *
 * This is NOT a re-transcription — ALTO mis-recognises glyphs and scrambles
 * column reading order on dense broadsheets, and no string transform can undo
 * that. What we CAN do cheaply is make the salvageable text easier to read:
 *
 *   - join words split across a line break by a hyphen ("com-\nforts")
 *   - collapse runs of whitespace and stray blank lines
 *   - normalise a few OCR punctuation artefacts
 *   - drop "noise" lines that are mostly digits/symbols (price tables, broken
 *     mastheads) and carry no real word
 *
 * Pure and side-effect free so it can run at render time with zero cost.
 */

/** A line is "real" prose if it contains at least one run of 4+ letters. */
const HAS_WORD = /[A-Za-zÀ-ſ]{4,}/;

/** Characters we treat as symbol noise when scoring a line. */
const SYMBOL = /[^A-Za-z0-9À-ſ\s.,;:'"()\-—–]/g;

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false; // blank lines are handled by paragraph collapsing
  if (HAS_WORD.test(trimmed)) return false; // any real word → keep the line

  const hasDigit = /\d/.test(trimmed);
  const symbolCount = (trimmed.match(SYMBOL) ?? []).length;
  // No real word AND (it's a number row or symbol-heavy) → drop it.
  return hasDigit || symbolCount >= 2 || trimmed.length <= 2;
}

export function cleanGalignaniOcr(raw: string): string {
  if (!raw) return "";

  const text = raw
    .replace(/\r\n?/g, "\n")
    // Soft hyphen → nothing.
    .replace(/­/g, "")
    // Word split across a line break by a hyphen: "com-\nforts" → "comforts".
    .replace(/([A-Za-zÀ-ſ])-\s*\n\s*([A-Za-zÀ-ſ])/g, "$1$2");

  const cleanedLines = text
    .split("\n")
    .filter((line) => !isNoiseLine(line))
    // Collapse intra-line whitespace and tidy space-before-punctuation.
    .map((line) =>
      line
        .replace(/[ \t]+/g, " ")
        .replace(/\s+([.,;:!?])/g, "$1")
        .trim(),
    );

  return cleanedLines
    .join("\n")
    // Collapse 3+ newlines into a paragraph break.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
