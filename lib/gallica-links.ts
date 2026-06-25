/**
 * lib/gallica-links.ts
 *
 * Client-safe Gallica URL builders. lib/gallica.ts cannot be imported from
 * "use client" components (it imports node:fs/promises and node:dns/promises
 * at module scope), so the handful of pure string templates needed by the
 * admin manual-recovery UI live here instead.
 */

const GALLICA_BASE = "https://gallica.bnf.fr";

/** Extract the short-form ark (e.g. "bpt6k446668c") from a Gallica permalink. */
export function extractArk(gallicaUrl: string): string | null {
  const match = /ark:\/12148\/([^/?#]+)/.exec(gallicaUrl);
  return match?.[1] ?? null;
}

/** IIIF full-resolution image URL for a given 1-indexed page. */
export function iiifPageImageUrl(ark: string, page: number): string {
  return `${GALLICA_BASE}/iiif/ark:/12148/${ark}/f${page}/full/full/0/native.jpg`;
}

/** Plain-text OCR endpoint, viewable directly in a browser tab. */
export function texteBrutViewUrl(ark: string): string {
  return `${GALLICA_BASE}/ark:/12148/${ark}.texteBrut`;
}

/** ALTO XML for a given 1-indexed page, viewable directly in a browser tab. */
export function altoPageViewUrl(ark: string, page: number): string {
  return `${GALLICA_BASE}/RequestDigitalElement?O=${ark}&E=ALTO&Deb=${page}`;
}
