/**
 * Pure helpers for splitting stitched French source text by page markers.
 * Kept separate from lib/llm/translate.ts so server actions can import it
 * without pulling in the Anthropic client or other non-action exports.
 */

export interface FrenchPageChunk {
  pageNumber: number;
  text: string;
}

/** Split stitched French source on `--- Page N ---` markers from ALTO/texteBrut. */
export function splitFrenchPages(frenchText: string): FrenchPageChunk[] {
  const parts = frenchText.split(/^--- Page \d+ ---\n?/m);
  const markers = [...frenchText.matchAll(/^--- Page (\d+) ---/gm)];

  if (markers.length === 0) {
    const trimmed = frenchText.trim();
    return trimmed.length > 0 ? [{ pageNumber: 1, text: frenchText }] : [];
  }

  return markers
    .map((m, i) => ({
      pageNumber: parseInt(m[1], 10),
      text: parts[i + 1] ?? "",
    }))
    .filter(({ text }) => text.trim().length > 0);
}
