/**
 * Per-page segmentation JSON cache in R2 — enables resuming a cancelled
 * translate run without re-calling the LLM for pages that already succeeded.
 */

import { getR2Text, putR2Text, r2ObjectExists } from "../r2-server";

export function segmentPageR2Key(date: string, pageNumber: number): string {
  return `${date}/en-segment/page-${pageNumber}.json`;
}

/** Per-page English anchor list (Pass B segmentation cache). */
export function segmentAnchorPageR2Key(
  date: string,
  pageNumber: number,
): string {
  return `${date}/en-segment-anchors/page-${pageNumber}.json`;
}

export async function loadAnchorPageFromR2(
  date: string,
  pageNumber: number,
): Promise<unknown | null> {
  const key = segmentAnchorPageR2Key(date, pageNumber);
  if (!(await r2ObjectExists(key))) return null;
  const raw = await getR2Text(key);
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function saveAnchorPageToR2(
  date: string,
  pageNumber: number,
  result: unknown,
): Promise<void> {
  await putR2Text(
    segmentAnchorPageR2Key(date, pageNumber),
    JSON.stringify(result),
  );
}

export async function loadSegmentPageFromR2(
  date: string,
  pageNumber: number,
): Promise<unknown | null> {
  const key = segmentPageR2Key(date, pageNumber);
  if (!(await r2ObjectExists(key))) return null;
  const raw = await getR2Text(key);
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function saveSegmentPageToR2(
  date: string,
  pageNumber: number,
  result: unknown,
): Promise<void> {
  await putR2Text(
    segmentPageR2Key(date, pageNumber),
    JSON.stringify(result),
  );
}

export async function allSegmentPagesCached(
  date: string,
  pageNumbers: number[],
): Promise<boolean> {
  if (pageNumbers.length === 0) return false;
  for (const pageNumber of pageNumbers) {
    if (!(await r2ObjectExists(segmentPageR2Key(date, pageNumber)))) {
      return false;
    }
  }
  return true;
}
