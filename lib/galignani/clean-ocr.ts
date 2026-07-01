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

/** Whole words of 4+ letters. */
const WHOLE_WORD = /\b[A-Za-zÀ-ſ]{4,}\b/g;

/** Characters we treat as symbol noise when scoring a line. */
const SYMBOL = /[^A-Za-z0-9À-ſ\s.,;:'"()\-—–]/g;

function countWholeWords(line: string): number {
  return (line.match(WHOLE_WORD) ?? []).length;
}

function financialNoiseRatio(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  const financial = (trimmed.match(/[\d£$%]/g) ?? []).length;
  return financial / trimmed.length;
}

function nonAlphaRatio(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  const alpha = (trimmed.match(/[A-Za-zÀ-ſ]/g) ?? []).length;
  return 1 - alpha / trimmed.length;
}

function isNoiseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false; // blank lines are handled by paragraph collapsing

  const wordCount = countWholeWords(trimmed);

  // Price tables, stock rows: mostly digits/currency.
  if (wordCount <= 2 && financialNoiseRatio(trimmed) >= 0.5) return true;

  // Column fragments: few real words, many short tokens, no sentence end.
  const tokenCount = trimmed.split(/\s+/).length;
  if (
    wordCount <= 2 &&
    !/[.?!]/.test(trimmed) &&
    (nonAlphaRatio(trimmed) >= 0.35 || tokenCount >= 4)
  ) {
    return true;
  }

  if (wordCount >= 1) return false;

  const hasDigit = /\d/.test(trimmed);
  const symbolCount = (trimmed.match(SYMBOL) ?? []).length;
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
    )
    .filter(Boolean);

  return (
    cleanedLines
      .join("\n")
      // Collapse 3+ newlines into a paragraph break.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
