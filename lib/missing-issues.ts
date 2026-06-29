/**
 * lib/missing-issues.ts
 *
 * Dates whose Journal des Débats issue was never digitised by Gallica (BnF)
 * and therefore cannot be sourced. These are *permanent* gaps in the archive —
 * distinct from issues that simply have not been ingested yet (which also have a
 * null `gallica_issue_url` but can still be pulled).
 *
 * 1844-11-03 is the only such gap across the entire Monte Cristo serialization
 * run. Gallica's holdings for 1844 jump from dayOfYear 307 (Nov 2) straight to
 * 309 (Nov 4), skipping 308 (Nov 3) — see content/gallica/issues-1844.xml. The
 * issue was printed (its feuilleton carried Chapter XXXIII, "Roman Bandits"),
 * but no scan exists to draw the rest of the paper from.
 */

export const MISSING_GALLICA_ISSUES: ReadonlySet<string> = new Set([
  "1844-11-03",
]);

/** True when this date's original issue is permanently absent from Gallica. */
export function isMissingGallicaIssue(date: string): boolean {
  return MISSING_GALLICA_ISSUES.has(date);
}

/**
 * Reader-facing explanation shown on every Débats-derived tab for a missing
 * issue. Kept here so the wording stays identical across tabs.
 */
export const MISSING_ISSUE_NOTE =
  "Gallica — the digital library of the Bibliothèque nationale de France — holds no scan of the Journal des Débats for this date. It is the only issue missing from the entire serialization run: the paper was printed and we know what ran in it, but no digitised copy survives to source from. The day's feuilleton chapter is restored from the public-domain text; the rest of the paper cannot be shown.";
