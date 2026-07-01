import type { ResolvedDocItem, ResolvedTextItem } from "@/lib/content";

const OCR_PAGE_SLOT = /^galignani-text-page-(\d+)$/;

/** Page number from a paged OCR text item's slot_key, or null. */
export function parseGalignaniOcrPageNumber(
  item: ResolvedTextItem,
): number | null {
  const slot = item.slot_key;
  if (!slot) return null;
  const m = OCR_PAGE_SLOT.exec(slot);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** Ingested per-page OCR text items, sorted by page number. */
export function listGalignaniOcrPages(
  items: ResolvedDocItem[],
): ResolvedTextItem[] {
  const pages: ResolvedTextItem[] = [];
  for (const item of items) {
    if (item.kind !== "text") continue;
    if (parseGalignaniOcrPageNumber(item) == null) continue;
    pages.push(item);
  }
  return pages.sort((a, b) => {
    const pa = parseGalignaniOcrPageNumber(a) ?? 0;
    const pb = parseGalignaniOcrPageNumber(b) ?? 0;
    return pa - pb;
  });
}

/** Curated text, audio, and legacy text without galignani-text-page-N slot. */
export function listGalignaniOtherItems(
  items: ResolvedDocItem[],
): ResolvedDocItem[] {
  const paged = new Set(listGalignaniOcrPages(items));
  return items.filter(
    (item) => item.kind !== "image" && !paged.has(item as ResolvedTextItem),
  );
}

/** Count of paged OCR text items (for TabRow galignaniPageCount). */
export function countGalignaniOcrPages(items: ResolvedDocItem[]): number {
  return listGalignaniOcrPages(items).length;
}
