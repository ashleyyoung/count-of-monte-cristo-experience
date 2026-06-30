/**
 * lib/book.ts
 *
 * The novel as a single linear sequence of 117 chapters — the spine of the
 * "read end to end" (/read) and "listen end to end" (/listen) sections.
 *
 * Derived from content/schedule.json: each installment lists the chapters it
 * carried, and chapters that span multiple installments repeat (with cont:true
 * on the continuations). We flatten and de-duplicate, keeping the first
 * occurrence's title, to recover the canonical I → CXVII order.
 *
 * Chapter text lives on R2 at gutenberg/chapters/{ROMAN}.txt (English, Project
 * Gutenberg #1184); narration MP3s are resolved via lib/narration.ts.
 */

import schedule from "@/content/schedule.json";
import type { Installment } from "@/lib/installments";

export interface BookChapter {
  num: string; // Roman numeral, uppercase — e.g. "XIV"
  title: string; // e.g. "The Dungeons"
  index: number; // 0-based position in the novel
  slug: string; // lowercase roman, used in URLs — e.g. "xiv"
}

// ---------------------------------------------------------------------------
// Build the canonical ordered list once at module load.
// ---------------------------------------------------------------------------

const _chapters: BookChapter[] = (() => {
  const seen = new Map<string, string>(); // num -> title (first occurrence wins)
  for (const inst of schedule.installments as Installment[]) {
    for (const ch of inst.chapters) {
      const num = ch.num.toUpperCase();
      if (!seen.has(num)) seen.set(num, ch.title);
    }
  }
  return [...seen.entries()].map(([num, title], index) => ({
    num,
    title,
    index,
    slug: num.toLowerCase(),
  }));
})();

const _bySlug = new Map<string, BookChapter>(
  _chapters.map((ch) => [ch.slug, ch]),
);

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

/** All 117 chapters in reading order. */
export function getAllChapters(): BookChapter[] {
  return _chapters;
}

/** Total chapter count (117). */
export function getChapterCount(): number {
  return _chapters.length;
}

/**
 * Look up a chapter by its Roman numeral in any case ("xiv", "XIV").
 * Returns null for unknown numerals.
 */
export function getChapter(num: string): BookChapter | null {
  return _bySlug.get(num.toLowerCase()) ?? null;
}

/** The next chapter after `num`, or null past the end. */
export function getNextChapter(num: string): BookChapter | null {
  const ch = getChapter(num);
  if (!ch) return null;
  return _chapters[ch.index + 1] ?? null;
}

/** The previous chapter before `num`, or null before the start. */
export function getPrevChapter(num: string): BookChapter | null {
  const ch = getChapter(num);
  if (!ch) return null;
  return ch.index > 0 ? _chapters[ch.index - 1] : null;
}

/** The first chapter (I. Marseilles — Arrival). */
export function getFirstChapter(): BookChapter {
  return _chapters[0];
}

/** R2 object key for a chapter's English Gutenberg text. */
export function chapterTextR2Key(num: string): string {
  return `gutenberg/chapters/${num.toUpperCase()}.txt`;
}

/**
 * Chapter text on R2 is stored as "<ROMAN>. <Title>\n\n<body>" (see
 * scripts/ingest-gutenberg.ts). The /read view prints the title in its own
 * styled heading, so drop that leading Gutenberg heading line to avoid showing
 * the chapter name twice (and in two different translations). A no-op when the
 * text doesn't begin with such a heading.
 */
export function stripChapterHeading(text: string | null): string | null {
  if (!text) return text;
  return text.replace(/^\s*[IVXLCDM]+\.[^\n]*\n+/, "");
}
