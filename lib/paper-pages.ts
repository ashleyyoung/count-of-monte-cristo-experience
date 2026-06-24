/** Active paper page (1-indexed) from the URL, defaulting to page 1. */
export function resolveActivePaperPage(
  pageCount: number,
  raw: string | null | undefined,
): number {
  if (pageCount <= 0) return 0;
  if (pageCount === 1) return 1;

  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= pageCount) return n;
  return 1;
}
