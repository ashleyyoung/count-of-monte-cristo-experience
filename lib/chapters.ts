import type { Chapter } from "@/lib/installments";
import type { DocItem } from "@/lib/types/content";

/** DOM id for the top of the chapter tab panel (scroll target when changing chapters). */
export const CHAPTER_TOP_ID = "chapter-top";

/** Roman numeral from a Gutenberg R2 key, e.g. `gutenberg/chapters/II.txt` → `II`. */
export function chapterNumFromR2Key(key: string): string | null {
  const m = key.match(/\/chapters\/([IVXLCDM]+)\.txt$/i);
  return m ? m[1].toUpperCase() : null;
}

/** Index of a chapter item in `doc.chapter`, matched by R2 key or schedule position. */
export function resolveChapterItemIndex(
  items: DocItem[],
  chapterNum: string,
  scheduleIndex: number,
): number {
  const upper = chapterNum.toUpperCase();
  const byKey = items.findIndex(
    (item) =>
      item.kind === "text" && chapterNumFromR2Key(item.text_r2_key) === upper,
  );
  if (byKey >= 0) return byKey;
  if (scheduleIndex >= 0 && scheduleIndex < items.length) return scheduleIndex;
  return -1;
}

/** Active chapter Roman numeral from the URL, defaulting to the first in the schedule. */
export function resolveActiveChapterNum(
  chapters: Chapter[],
  raw: string | null | undefined,
): string | null {
  if (chapters.length === 0) return null;
  if (chapters.length === 1) return chapters[0].num;

  const upper = raw?.toUpperCase();
  if (upper && chapters.some((ch) => ch.num.toUpperCase() === upper)) {
    return chapters.find((ch) => ch.num.toUpperCase() === upper)!.num;
  }
  return chapters[0].num;
}

export function chapterTabLabel(chapterCount: number): string {
  return chapterCount > 1 ? "Chapters" : "Chapter";
}

export function formatChapterTabLabel(ch: Chapter): string {
  return `${ch.num}. ${ch.title}`;
}
