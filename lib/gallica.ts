/**
 * lib/gallica.ts
 *
 * Pure, unit-testable helpers for the Gallica BnF digital library API.
 *
 * Covers:
 *  - URL builders (Issues service, IIIF Image API v1.1, ALTO, texteBrut, Pagination)
 *  - Date ↔ dayOfYear conversion
 *  - XML parsers: Issues service response, Pagination service response
 *  - ALTO XML parser: text-block bounding boxes + text content
 *  - Feuilleton strip region derivation (heuristic: largest vertical gap on page 1)
 *  - Fetch wrappers (HTTP only — no R2/DB writes, those live in scripts/gallica/*)
 *
 * Rate limits enforced by callers (scripts/gallica/*):
 *  - IIIF full/full or >1000px: 5 req/min  → ≥12 s between page downloads
 *  - texteBrut: 5 req/min                  → ≥12 s between calls
 *  - ALTO / Pagination: no published limit; callers add polite delays (≥1 s)
 */

import dns from "node:dns/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Periodical ARK for *Journal des Débats politiques et littéraires* on Gallica. */
export const DEBATS_PERIODICAL_ARK = "cb39294634r";

const GALLICA_BASE = "https://gallica.bnf.fr";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GallicaIssue {
  /** Short-form ARK, e.g. "bpt6k446670p" (no ark:/12148/ prefix). */
  ark: string;
  /** ISO date of the issue, e.g. "1844-08-28". */
  date: string;
  /** Total number of page images in the issue. */
  pageCount: number;
  /** Canonical Gallica permalink (use as source_url on media_assets rows). */
  gallicaUrl: string;
}

export interface IIIFDimensions {
  width: number;
  height: number;
}

/** A pixel-coordinate bounding box on a Gallica page image. */
export interface PixelRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A text block extracted from Gallica's ALTO XML for a single page. */
export interface AltoTextBlock {
  /** ALTO element ID. */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Concatenated text content of all String children. */
  text: string;
}

// ---------------------------------------------------------------------------
// URL builders (pure)
// ---------------------------------------------------------------------------

/**
 * Issues service URL: returns XML listing all issues for a periodical in a
 * given year, each with its ARK and dayOfYear.
 *
 * @param periodicalArk - Short-form catalogue ARK, e.g. "cb39294634r"
 * @param year          - Four-digit year
 */
export function issuesServiceUrl(periodicalArk: string, year: number): string {
  return `${GALLICA_BASE}/services/Issues?ark=ark:/12148/${periodicalArk}/date&date=${year}`;
}

/**
 * Pagination service URL: returns XML with total page count for an issue.
 *
 * @param issueArk - Short-form issue ARK, e.g. "bpt6k446670p"
 */
export function paginationServiceUrl(issueArk: string): string {
  return `${GALLICA_BASE}/services/Pagination?ark=${issueArk}`;
}

/**
 * IIIF Image API v1.1 image request URL.
 *
 * @param issueArk - Short-form issue ARK
 * @param page     - 1-based page number (f1 = cover)
 * @param region   - "full" | "x,y,w,h" | "pct:x,y,w,h"
 * @param size     - "full" | "w," | ",h" | "w,h" (proportional by default use "full")
 * @param rotation - degrees, default "0"
 * @param quality  - "native" (Gallica's IIIF v1.1 quality parameter)
 * @param format   - "jpg" | "png", default "jpg"
 */
export function iiifImageUrl(
  issueArk: string,
  page: number,
  region = "full",
  size = "full",
  rotation = "0",
  quality = "native",
  format = "jpg",
): string {
  return `${GALLICA_BASE}/iiif/ark:/12148/${issueArk}/f${page}/${region}/${size}/${rotation}/${quality}.${format}`;
}

/**
 * IIIF Image info.json URL — returns image dimensions and available sizes
 * without downloading the full image.
 */
export function iiifInfoUrl(issueArk: string, page: number): string {
  return `${GALLICA_BASE}/iiif/ark:/12148/${issueArk}/f${page}/info.json`;
}

/** IIIF Presentation manifest URL — page dimensions for all canvases in one request. */
export function iiifManifestUrl(issueArk: string): string {
  return `${GALLICA_BASE}/iiif/ark:/12148/${issueArk}/manifest.json`;
}

/**
 * Fetch all page dimensions in one manifest request. Returns 1-indexed map.
 * The manifest is metadata, not a full/full image request, so it is not subject
 * to the 5/min IIIF image rate limit.
 */
export async function fetchIIIFManifestDimensions(
  issueArk: string,
): Promise<Map<number, IIIFDimensions>> {
  const url = iiifManifestUrl(issueArk);
  const text = await gallicaFetch(url);
  const manifest = JSON.parse(text) as {
    sequences?: { canvases?: { width?: number; height?: number }[] }[];
  };
  const canvases = manifest?.sequences?.[0]?.canvases ?? [];
  const map = new Map<number, IIIFDimensions>();
  canvases.forEach((c, i) => {
    if (c.width && c.height) {
      map.set(i + 1, { width: c.width, height: c.height });
    }
  });
  return map;
}

/**
 * ALTO XML endpoint for a single page of a Gallica document.
 * Returns Gallica's pre-existing OCR output as structured ALTO XML.
 *
 * @param issueArk - Short-form issue ARK
 * @param page     - 1-based page number
 */
export function altoUrl(issueArk: string, page: number): string {
  return `${GALLICA_BASE}/RequestDigitalElement?O=${issueArk}&E=ALTO&Deb=${page}`;
}

/**
 * texteBrut URL — plain-text OCR content for the full issue.
 * Optional page restricts to a single page (uses Gallica's f{page}n0 qualifier).
 *
 * Rate limit: 5 calls/min.
 */
export function texteBrutUrl(issueArk: string, page?: number): string {
  const base = `${GALLICA_BASE}/ark:/12148/${issueArk}.texteBrut`;
  if (page !== undefined) {
    // f{X}n0 = "start at page X, 0 additional pages" (just that one page)
    return `${base}f${page}n0`;
  }
  return base;
}

/** Canonical Gallica document permalink — use as `source_url` on media_assets rows. */
export function gallicaPermalink(issueArk: string): string {
  return `${GALLICA_BASE}/ark:/12148/${issueArk}`;
}

/**
 * Extract the short-form issue ARK from a Gallica permalink or ARK URL.
 * e.g. https://gallica.bnf.fr/ark:/12148/bpt6k446668c → bpt6k446668c
 */
export function parseArkFromGallicaUrl(url: string): string | null {
  const match = /ark:\/12148\/([^/?#]+)/.exec(url);
  return match?.[1] ?? null;
}

/** Default page count for Journal des Débats issues when Pagination is unavailable. */
export const DEBATS_DEFAULT_PAGE_COUNT = 4;

/**
 * Serialize a PixelRegion to the IIIF "x,y,w,h" region string.
 * Values must be integer pixels in the page's native coordinate space.
 */
export function pixelRegion(r: PixelRegion): string {
  return `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}`;
}

/**
 * Serialize a region as a IIIF percentage region "pct:x,y,w,h".
 * Each value is a percentage (0–100) of the image dimension.
 */
export function pctRegion(x: number, y: number, w: number, h: number): string {
  return `pct:${x},${y},${w},${h}`;
}

// ---------------------------------------------------------------------------
// Date utilities (pure)
// ---------------------------------------------------------------------------

/** Returns true when year is a leap year. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Convert an ISO date string (YYYY-MM-DD) to the 1-based day-of-year.
 * Matches the `dayOfYear` attribute in Gallica's Issues XML response.
 */
export function isoToDayOfYear(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const DAYS_BEFORE_MONTH = [
    0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334,
  ];
  const leapBonus = isLeapYear(y) && m > 2 ? 1 : 0;
  return DAYS_BEFORE_MONTH[m - 1] + leapBonus + d;
}

// ---------------------------------------------------------------------------
// XML parsers (pure)
// ---------------------------------------------------------------------------

/**
 * Parse Gallica's Issues service XML and find the issue matching the target date.
 *
 * @param xml        - Raw XML response string from the Issues service
 * @param targetDate - ISO date to match, e.g. "1844-08-28"
 * @returns Short-form ARK and dayOfYear, or null if not found
 */
export function parseIssuesXml(
  xml: string,
  targetDate: string,
): { ark: string; dayOfYear: number } | null {
  const targetDoy = isoToDayOfYear(targetDate);
  // Match each <issue ...> opening tag regardless of attribute order
  const issueTagRe = /<issue\s([^>]+)>/g;
  const attrRe = /(\w+)="([^"]*)"/g;

  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = issueTagRe.exec(xml)) !== null) {
    const attrs: Record<string, string> = {};
    let attrMatch: RegExpExecArray | null;
    attrRe.lastIndex = 0;
    while ((attrMatch = attrRe.exec(tagMatch[1])) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    if (attrs.ark && attrs.dayOfYear) {
      const doy = parseInt(attrs.dayOfYear, 10);
      if (doy === targetDoy) {
        return { ark: attrs.ark, dayOfYear: doy };
      }
    }
  }
  return null;
}

/**
 * Parse Gallica's Pagination service XML to extract the total page count.
 *
 * @param xml - Raw XML response string from the Pagination service
 * @returns Total number of pages, or null if not parseable
 */
export function parsePaginationXml(xml: string): number | null {
  const m = /nbVuesTotales="(\d+)"/.exec(xml);
  if (!m) return null;
  return parseInt(m[1], 10);
}

// ---------------------------------------------------------------------------
// ALTO XML parser (pure)
// ---------------------------------------------------------------------------

/**
 * Parse Gallica's ALTO XML for a single page and return all TextBlock
 * bounding boxes with their concatenated text content.
 *
 * Handles both BnF ALTO namespace variants:
 *  - http://bibnum.bnf.fr/alto_prod/   (pre-2014)
 *  - http://bibnum.bnf.fr/alto_bnf-v2_0/  (2014+)
 *  - http://www.loc.gov/standards/alto/ns-v2#  (standard v2)
 *
 * @param xml - Raw ALTO XML string
 */
export function parseAltoXml(xml: string): AltoTextBlock[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true, // strips namespace prefixes so we can use plain tag names
  });

  let parsed: Record<string, unknown>;
  try {
    parsed = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  // Navigate to the Layout > Page > PrintSpace level
  const alto = (parsed.alto ?? parsed.Alto) as
    | Record<string, unknown>
    | undefined;
  if (!alto) return [];
  const layout = alto.Layout as Record<string, unknown> | undefined;
  if (!layout) return [];

  // Page may be a single object or an array; always normalise to array
  const rawPage = layout.Page;
  const pages: unknown[] = Array.isArray(rawPage)
    ? rawPage
    : rawPage != null
      ? [rawPage]
      : [];
  if (pages.length === 0) return [];

  // Take the first page (scripts call parseAltoXml per page, not per document)
  const page = pages[0] as Record<string, unknown>;
  const printSpace = page.PrintSpace as Record<string, unknown> | undefined;
  if (!printSpace) return [];

  const rawBlocks = printSpace.TextBlock;
  const blocks: unknown[] = Array.isArray(rawBlocks)
    ? rawBlocks
    : rawBlocks != null
      ? [rawBlocks]
      : [];

  const result: AltoTextBlock[] = [];

  for (const raw of blocks) {
    const block = raw as Record<string, unknown>;
    const id = String(block["@_ID"] ?? "");
    const x = Number(block["@_HPOS"] ?? 0);
    const y = Number(block["@_VPOS"] ?? 0);
    const w = Number(block["@_WIDTH"] ?? 0);
    const h = Number(block["@_HEIGHT"] ?? 0);

    // Collect all String CONTENT values within this block
    const textParts: string[] = [];
    const rawLines = block.TextLine;
    const lines: unknown[] = Array.isArray(rawLines)
      ? rawLines
      : rawLines != null
        ? [rawLines]
        : [];

    for (const rawLine of lines) {
      const line = rawLine as Record<string, unknown>;
      const rawStrings = line.String;
      const strings: unknown[] = Array.isArray(rawStrings)
        ? rawStrings
        : rawStrings != null
          ? [rawStrings]
          : [];
      for (const s of strings) {
        const content = (s as Record<string, unknown>)["@_CONTENT"];
        if (content != null && String(content).trim()) {
          textParts.push(String(content));
        }
      }
    }

    if (w > 0 && h > 0) {
      result.push({ id, x, y, w, h, text: textParts.join(" ") });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Feuilleton strip region derivation (pure)
// ---------------------------------------------------------------------------

/**
 * Attempt to auto-derive the feuilleton strip bounding box from ALTO text
 * blocks on page 1 of the Journal des Débats.
 *
 * Heuristic: the feuilleton is printed in a horizontal strip at the very
 * bottom of the front page, separated from the news columns above by a
 * physical rule (which appears as a gap in the ALTO TextBlock distribution).
 * We find the largest vertical gap between consecutive TextBlocks and treat
 * everything below that gap as the feuilleton.
 *
 * Returns null if no clear gap is found (caller should fall back to a
 * manually specified region).
 *
 * @param blocks     - TextBlocks from parseAltoXml() for page 1
 * @param dimensions - Page dimensions from fetchIIIFDimensions() or info.json
 * @param minGap     - Minimum pixel gap to qualify as the feuilleton separator
 *                     (default 40px — a printed rule with surrounding whitespace)
 */
export function deriveFeuilletonRegion(
  blocks: AltoTextBlock[],
  dimensions: IIIFDimensions,
  minGap = 40,
): PixelRegion | null {
  if (blocks.length < 2) return null;

  // Sort by vertical position (top of block)
  const sorted = [...blocks].sort((a, b) => a.y - b.y);

  // Find the largest gap between consecutive block bottoms and next block tops
  let bestGapY = -1;
  let bestGapSize = 0;

  for (let i = 0; i < sorted.length - 1; i++) {
    const bottomOfCurrent = sorted[i].y + sorted[i].h;
    const topOfNext = sorted[i + 1].y;
    const gap = topOfNext - bottomOfCurrent;
    if (gap > bestGapSize) {
      bestGapSize = gap;
      // The feuilleton starts at the top of the block after the gap
      bestGapY = topOfNext;
    }
  }

  if (bestGapSize < minGap || bestGapY < 0) return null;

  // Feuilleton blocks are everything at or below bestGapY
  const feuilBlocks = sorted.filter((b) => b.y >= bestGapY);
  if (feuilBlocks.length === 0) return null;

  // Sanity check: the feuilleton must be in the lower half of the page
  if (bestGapY < dimensions.height * 0.5) return null;

  const minX = Math.min(...feuilBlocks.map((b) => b.x));
  const minY = Math.min(...feuilBlocks.map((b) => b.y));
  const maxX = Math.max(...feuilBlocks.map((b) => b.x + b.w));
  const maxY = Math.max(...feuilBlocks.map((b) => b.y + b.h));

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---------------------------------------------------------------------------
// Fetch wrappers (I/O — HTTP calls, no R2/DB writes)
// ---------------------------------------------------------------------------

/** Options for Gallica HTTP fetch helpers (retry logging, etc.). */
export interface GallicaFetchOptions {
  log?: (msg: string) => void;
  /** Short label in log lines, e.g. "texteBrut". */
  label?: string;
}

function gallicaLog(options?: GallicaFetchOptions): (msg: string) => void {
  const label = options?.label;
  const prefix = label ? `[gallica:${label}]` : "[gallica]";
  const sink =
    options?.log ?? ((msg: string) => console.error(`${prefix} ${msg}`));
  return (msg: string) => sink(msg);
}

function truncateForLog(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max)}…`;
}

/**
 * Gallica fetch helper with structured error logging.
 * Throws a GallicaFetchError on non-OK HTTP responses.
 */
export class GallicaFetchError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "GallicaFetchError";
  }
}

/** Cloudflare / origin errors that often clear on retry. */
const RETRYABLE_STATUS = new Set([403, 429, 502, 503, 504, 522, 524, 525]);

/**
 * Default identifying User-Agent. BnF asks bots to identify themselves with a
 * contact. Override via GALLICA_USER_AGENT, or supply just a contact (email or
 * URL) via GALLICA_CONTACT to have it appended automatically.
 */
function defaultUserAgent(): string {
  const contact = process.env.GALLICA_CONTACT?.trim();
  const base = "monte-cristo-archive/1.0 (non-commercial research project)";
  return contact ? `${base}; +${contact}` : base;
}

function gallicaUserAgent(): string {
  return process.env.GALLICA_USER_AGENT?.trim() || defaultUserAgent();
}

/**
 * Build request headers for a Gallica URL. Includes a Referer pointing at the
 * document viewer (Cloudflare treats "viewer → resource" navigations as more
 * human), an identifying User-Agent, and browser-like Accept hints.
 */
function buildGallicaHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": gallicaUserAgent(),
    Accept:
      "text/plain, text/html, application/xhtml+xml, application/xml;q=0.9, image/avif, image/webp, */*;q=0.8",
    "Accept-Language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
  };

  const ark = parseArkFromGallicaUrl(url);
  if (ark) {
    headers["Referer"] = `${GALLICA_BASE}/ark:/12148/${ark}`;
  } else {
    headers["Referer"] = `${GALLICA_BASE}/`;
  }

  return headers;
}

/** Per-attempt fetch timeout (Gallica Issues can take 10+ s when healthy). */
const FETCH_TIMEOUT_MS = 90_000;

const FETCH_MAX_ATTEMPTS = Number(process.env.GALLICA_MAX_ATTEMPTS) || 8;

/** Cap on any single backoff wait (default 5 min). Override via GALLICA_MAX_BACKOFF_MS. */
const MAX_BACKOFF_MS = Number(process.env.GALLICA_MAX_BACKOFF_MS) || 300_000;

function networkErrorCode(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;
  const cause = err.cause;
  if (cause && typeof cause === "object" && "code" in cause) {
    return String((cause as { code?: string }).code);
  }
  return undefined;
}

function retryDelayMs(
  attempt: number,
  status?: number,
  networkCode?: string,
): number {
  // 403/429 = Cloudflare bot protection / rate limit. Back off generously so we
  // do not dig the IP deeper into the penalty box: 60s, 120s, 240s … capped.
  if (status === 403 || status === 429) {
    const base = Math.min(60_000 * 2 ** attempt, MAX_BACKOFF_MS);
    return base + Math.floor(Math.random() * 2_000);
  }
  // 522 (Cloudflare connection timed out), 524 (a timeout occurred),
  // 525 (SSL handshake failed) — Gallica's origin is struggling and
  // typically stays down for several minutes. Start at 30s so we don't
  // burn all attempts in under 90s.
  if (status === 522 || status === 524 || status === 525) {
    const cfDelays = [
      30_000, 60_000, 120_000, 180_000, 240_000, 300_000, 300_000, 300_000,
    ];
    return (cfDelays[attempt] ?? 300_000) + Math.floor(Math.random() * 5_000);
  }
  // DNS / socket failures. The network may be down for minutes; give it
  // more room than the old 6-step ladder, and cap later waits at 2 min.
  if (networkCode === "ENOTFOUND" || networkCode === "EAI_AGAIN") {
    const dnsDelays = [
      5_000, 15_000, 30_000, 60_000, 90_000, 120_000, 120_000, 120_000,
    ];
    return (dnsDelays[attempt] ?? 120_000) + Math.floor(Math.random() * 1_000);
  }
  const base = Math.min(2_000 * 2 ** attempt, MAX_BACKOFF_MS);
  return base + Math.floor(Math.random() * 500);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll dns.resolve4 (bypasses OS cache) every `intervalMs` until the hostname
 * resolves or `maxWaitMs` elapses. Used after ENOTFOUND to avoid blindly
 * sleeping a fixed duration when DNS may recover in seconds.
 *
 * Returns immediately (without error) if the probe times out, so the caller's
 * retry loop can make one more fetch attempt and fail with a clear error if DNS
 * is truly broken.
 */
async function waitForDnsResolution(
  hostname: string,
  log: (msg: string) => void,
  maxWaitMs: number,
  intervalMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await sleep(intervalMs);
    try {
      await dns.resolve4(hostname);
      log(`DNS probe: ${hostname} resolved — proceeding with retry`);
      return;
    } catch {
      const remaining = Math.max(0, deadline - Date.now());
      if (remaining > 0) {
        log(
          `DNS probe: ${hostname} still unreachable; ${(remaining / 1000).toFixed(0)}s remaining…`,
        );
      }
    }
  }
  log(`DNS probe: timed out waiting for ${hostname} — retrying anyway`);
}

// ---------------------------------------------------------------------------
// Per-class request spacing (BnF: 5/min for IIIF full/full and texteBrut)
// ---------------------------------------------------------------------------

type GallicaRequestClass = "iiif_full" | "textebrut" | "metadata";

const THROTTLE_MS: Record<GallicaRequestClass, number> = {
  iiif_full: 15_000,
  textebrut: 15_000,
  metadata: 1_200,
};

const lastRequestAt: Record<GallicaRequestClass, number> = {
  iiif_full: 0,
  textebrut: 0,
  metadata: 0,
};

/** Timestamp of the most recent Gallica request, regardless of class. */
let lastAnyRequestAt = 0;

/**
 * Global hold: when Gallica sends a Retry-After (on 522/429), all subsequent
 * requests of any class must wait until this timestamp. This prevents firing
 * the next endpoint immediately after a Retry-After delay on a different one,
 * which is what triggers cascading 522 → 429 storms.
 */
let globalHoldUntil = 0;

export function setGallicaGlobalHold(untilMs: number): void {
  if (untilMs > globalHoldUntil) {
    globalHoldUntil = untilMs;
  }
}

function classifyGallicaUrl(url: string): GallicaRequestClass {
  if (url.includes(".texteBrut")) return "textebrut";
  if (url.includes("/iiif/")) {
    if (url.includes("/info.json") || url.includes("/manifest.json")) {
      return "metadata";
    }
    if (
      url.includes("/full/full/") ||
      url.includes("/native.jpg") ||
      url.includes("/native.png")
    ) {
      return "iiif_full";
    }
  }
  return "metadata";
}

async function waitForGallicaThrottle(
  url: string,
  log: (msg: string) => void,
): Promise<void> {
  // 1. Global hold: any recent 522/429 Retry-After blocks all classes.
  const holdWait = globalHoldUntil - Date.now();
  if (holdWait > 0) {
    log(
      `throttle [global hold]: waiting ${(holdWait / 1000).toFixed(1)}s before request…`,
    );
    await sleep(holdWait);
  }

  // 2. Cross-class minimum: at least metadata gap since the last request of
  //    ANY class. Prevents firing texteBrut immediately after an iiif_full.
  const crossGap = THROTTLE_MS.metadata;
  const crossElapsed = Date.now() - lastAnyRequestAt;
  if (lastAnyRequestAt > 0 && crossElapsed < crossGap) {
    await sleep(crossGap - crossElapsed);
  }

  // 3. Per-class minimum: e.g. 15s between consecutive texteBrut calls.
  const cls = classifyGallicaUrl(url);
  const minGap = THROTTLE_MS[cls];
  const last = lastRequestAt[cls];
  const elapsed = Date.now() - last;
  if (last > 0 && elapsed < minGap) {
    const wait = minGap - elapsed;
    log(
      `throttle [${cls}]: waiting ${(wait / 1000).toFixed(1)}s before request…`,
    );
    await sleep(wait);
  }
}

function markGallicaRequest(url: string): void {
  const now = Date.now();
  lastRequestAt[classifyGallicaUrl(url)] = now;
  lastAnyRequestAt = now;
}

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("Retry-After")?.trim();
  if (!raw) return null;
  const seconds = parseInt(raw, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1_000;
  const when = Date.parse(raw);
  if (Number.isFinite(when)) {
    const ms = when - Date.now();
    return ms > 0 ? ms : null;
  }
  return null;
}

function networkErrorDetail(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = err.cause;
  if (cause && typeof cause === "object" && "code" in cause) {
    const code = String((cause as { code?: string }).code);
    const host =
      "hostname" in cause
        ? String((cause as { hostname?: string }).hostname)
        : undefined;
    if (code === "ENOTFOUND" && host) {
      return `DNS lookup failed for ${host} (ENOTFOUND). Check your network or DNS resolver, then retry.`;
    }
    return `${err.message} (${code})`;
  }
  return err.message;
}

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = err.cause;
  if (!cause || typeof cause !== "object" || !("code" in cause)) return true;
  const code = String((cause as { code?: string }).code);
  // Retry transient DNS / socket failures; do not retry TLS cert errors.
  return (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET"
  );
}

async function gallicaFetchResponse(
  url: string,
  maxAttempts = FETCH_MAX_ATTEMPTS,
  options?: GallicaFetchOptions,
): Promise<Response> {
  const log = gallicaLog(options);
  let lastHttpError: GallicaFetchError | undefined;
  let lastNetworkError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptNum = attempt + 1;
    log(
      `attempt ${attemptNum}/${maxAttempts}: GET ${url} (timeout ${FETCH_TIMEOUT_MS / 1000}s)`,
    );
    const attemptStart = Date.now();
    let pendingDelayMs = 0;

    try {
      await waitForGallicaThrottle(url, log);
      markGallicaRequest(url);

      const res = await fetch(url, {
        headers: buildGallicaHeaders(url),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const attemptMs = Date.now() - attemptStart;

      if (res.ok) {
        const contentType = res.headers.get("content-type") ?? "unknown";
        const contentLength = res.headers.get("content-length");
        log(
          `attempt ${attemptNum} OK in ${attemptMs}ms: HTTP ${res.status}; ` +
            `content-type=${contentType}` +
            (contentLength ? `; content-length=${contentLength}` : ""),
        );
        return res;
      }

      lastHttpError = new GallicaFetchError(
        url,
        res.status,
        `HTTP ${res.status} from ${url}`,
      );
      log(
        `attempt ${attemptNum} failed in ${attemptMs}ms: HTTP ${res.status} from ${url}`,
      );

      if (!RETRYABLE_STATUS.has(res.status) || attempt === maxAttempts - 1) {
        throw lastHttpError;
      }

      pendingDelayMs = retryDelayMs(attempt, res.status);
      const retryAfterMs = parseRetryAfterMs(res);
      if (retryAfterMs != null) {
        pendingDelayMs = Math.max(pendingDelayMs, retryAfterMs);
        // Broadcast: any concurrent/future request of any class must also
        // wait at least this long before hitting Gallica again.
        setGallicaGlobalHold(Date.now() + pendingDelayMs);
        log(
          `HTTP ${res.status} Retry-After: waiting ${(pendingDelayMs / 1000).toFixed(1)}s before retry…`,
        );
      } else if (
        res.status === 522 ||
        res.status === 524 ||
        res.status === 525
      ) {
        // Cloudflare origin-down errors: set a global hold even without a
        // Retry-After header so other endpoints don't pile on immediately.
        setGallicaGlobalHold(Date.now() + pendingDelayMs);
        log(
          `HTTP ${res.status} is retryable; waiting ${(pendingDelayMs / 1000).toFixed(1)}s before retry…`,
        );
      } else {
        log(
          `HTTP ${res.status} is retryable; waiting ${(pendingDelayMs / 1000).toFixed(1)}s before retry…`,
        );
      }
    } catch (err) {
      if (err instanceof GallicaFetchError) throw err;

      const attemptMs = Date.now() - attemptStart;
      lastNetworkError =
        err instanceof Error ? err : new Error(networkErrorDetail(err));
      const detail = networkErrorDetail(err);
      const code = networkErrorCode(err);
      log(
        `attempt ${attemptNum} network error in ${attemptMs}ms: ${detail}` +
          (code ? ` (${code})` : ""),
      );

      if (!isRetryableNetworkError(err) || attempt === maxAttempts - 1) {
        throw new GallicaFetchError(url, 0, networkErrorDetail(err), {
          cause: err,
        });
      }

      pendingDelayMs = retryDelayMs(attempt, undefined, code);

      if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
        // Rather than a fixed sleep, poll dns.resolve4 (bypasses OS cache)
        // so we retry as soon as DNS actually recovers instead of wasting
        // the full backoff window when the outage is brief.
        const hostname = new URL(url).hostname;
        await waitForDnsResolution(hostname, log, pendingDelayMs);
      } else {
        log(
          `network error is retryable; waiting ${(pendingDelayMs / 1000).toFixed(1)}s before retry…`,
        );
        await sleep(pendingDelayMs);
      }
      continue;
    }

    await sleep(pendingDelayMs);
  }

  if (lastHttpError) throw lastHttpError;
  throw new GallicaFetchError(
    url,
    0,
    lastNetworkError
      ? networkErrorDetail(lastNetworkError)
      : `Failed to fetch ${url}`,
    { cause: lastNetworkError },
  );
}

async function gallicaFetch(
  url: string,
  options?: GallicaFetchOptions,
): Promise<string> {
  const res = await gallicaFetchResponse(url, FETCH_MAX_ATTEMPTS, options);
  return res.text();
}

async function gallicaFetchBinary(url: string): Promise<Buffer> {
  const res = await gallicaFetchResponse(url);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// Year-level Issues XML cache (memory + disk)
// ---------------------------------------------------------------------------

const issuesMemoryCache = new Map<string, string>();

export interface GallicaCacheOptions {
  /** When true, bypass memory and disk cache and re-fetch from Gallica. */
  refresh?: boolean;
}

/** Disk path for cached Issues XML for a given year. */
export function issuesCachePath(year: number): string {
  return path.join(process.cwd(), "content", "gallica", `issues-${year}.xml`);
}

function issuesCacheKey(periodicalArk: string, year: number): string {
  return `${periodicalArk}:${year}`;
}

/**
 * Fetch (or load from cache) the Gallica Issues service XML for a full year.
 * Cached in memory for the process lifetime and on disk at content/gallica/.
 */
export async function fetchYearIssuesXml(
  periodicalArk: string,
  year: number,
  options?: GallicaCacheOptions,
): Promise<string> {
  const cacheKey = issuesCacheKey(periodicalArk, year);

  if (!options?.refresh && issuesMemoryCache.has(cacheKey)) {
    return issuesMemoryCache.get(cacheKey)!;
  }

  if (!options?.refresh) {
    try {
      const diskXml = await fs.readFile(issuesCachePath(year), "utf-8");
      if (diskXml.trim()) {
        issuesMemoryCache.set(cacheKey, diskXml);
        return diskXml;
      }
    } catch {
      // cache miss — fetch from Gallica
    }
  }

  const xml = await gallicaFetch(issuesServiceUrl(periodicalArk, year));
  issuesMemoryCache.set(cacheKey, xml);
  await fs.mkdir(path.dirname(issuesCachePath(year)), { recursive: true });
  await fs.writeFile(issuesCachePath(year), xml, "utf-8");
  return xml;
}

/** Pre-fetch Issues XML for one or more years (used by warm-issues-cache.ts). */
export async function warmIssuesCache(
  periodicalArk: string,
  years: number[],
  options?: GallicaCacheOptions,
): Promise<Array<{ year: number; path: string }>> {
  const results: Array<{ year: number; path: string }> = [];
  for (const year of years) {
    await fetchYearIssuesXml(periodicalArk, year, options);
    results.push({ year, path: issuesCachePath(year) });
  }
  return results;
}

export interface ResolveIssueArkOptions extends GallicaCacheOptions {
  /** When set, skip Pagination API and use this page count. */
  knownPageCount?: number;
}

/**
 * Resolve an issue ARK and page count from an ISO date string.
 *
 * Uses cached year-level Issues XML when available, then Pagination (unless
 * knownPageCount is provided).
 */
export async function resolveIssueArk(
  periodicalArk: string,
  isoDate: string,
  options?: ResolveIssueArkOptions,
): Promise<{ ark: string; pageCount: number } | null> {
  const year = parseInt(isoDate.slice(0, 4), 10);
  const issuesXml = await fetchYearIssuesXml(periodicalArk, year, options);
  const match = parseIssuesXml(issuesXml, isoDate);
  if (!match) return null;

  if (options?.knownPageCount != null) {
    return { ark: match.ark, pageCount: options.knownPageCount };
  }

  const pagXml = await gallicaFetch(paginationServiceUrl(match.ark));
  const pageCount = parsePaginationXml(pagXml) ?? DEBATS_DEFAULT_PAGE_COUNT;

  return { ark: match.ark, pageCount };
}

/** True when an error likely means Gallica rate-limits or DNS — batch should cooldown. */
export function isGallicaThrottleError(err: unknown): boolean {
  if (err instanceof GallicaFetchError) {
    if (err.status === 0) {
      const code = networkErrorCode(err);
      return code === "ENOTFOUND" || code === "EAI_AGAIN";
    }
    return [403, 429, 502, 503, 504, 522, 524, 525].includes(err.status);
  }
  if (err instanceof Error) {
    if (/HTTP (403|429|502|503|504|522|524|525)/.test(err.message)) return true;
    if (/DNS lookup failed/.test(err.message)) return true;
    const code = networkErrorCode(err);
    return code === "ENOTFOUND" || code === "EAI_AGAIN";
  }
  return false;
}

/**
 * Fetch the IIIF image dimensions for a specific page via info.json.
 * Does not download the full image.
 */
export async function fetchIIIFDimensions(
  issueArk: string,
  page: number,
): Promise<IIIFDimensions> {
  const url = iiifInfoUrl(issueArk, page);
  const text = await gallicaFetch(url);
  const json = JSON.parse(text) as { width?: number; height?: number };
  if (!json.width || !json.height) {
    throw new Error(`info.json missing dimensions for ${issueArk}/f${page}`);
  }
  return { width: json.width, height: json.height };
}

/**
 * Fetch a full-page IIIF image at native quality.
 * Caller must respect the rate limit: ≥12 s between calls.
 */
export async function fetchIIIFPage(
  issueArk: string,
  page: number,
  region = "full",
  size = "full",
): Promise<Buffer> {
  const url = iiifImageUrl(issueArk, page, region, size);
  return gallicaFetchBinary(url);
}

/**
 * Fetch Gallica's pre-existing ALTO XML for a single page.
 * The ALTO contains text-block bounding boxes from Gallica's own OCR pipeline.
 */
export async function fetchAltoXml(
  issueArk: string,
  page: number,
): Promise<string> {
  return gallicaFetch(altoUrl(issueArk, page));
}

/**
 * Fetch the plain-text OCR content (texteBrut) for an issue.
 * Pass `page` to restrict to a single page.
 *
 * Rate limit: 5 calls/min. Caller must enforce ≥12 s between calls.
 */
export async function fetchTexteBrut(
  issueArk: string,
  page?: number,
  options?: GallicaFetchOptions,
): Promise<string> {
  const log = gallicaLog({ ...options, label: options?.label ?? "texteBrut" });
  const url = texteBrutUrl(issueArk, page);
  const startedAt = Date.now();

  log(`fetching ${url}`);

  let res: Response;
  try {
    res = await gallicaFetchResponse(url, FETCH_MAX_ATTEMPTS, {
      ...options,
      label: options?.label ?? "texteBrut",
    });
  } catch (err) {
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (err instanceof GallicaFetchError) {
      log(
        `gave up after ${elapsed}s: ${err.message} (final status=${err.status})`,
      );
    } else {
      log(
        `gave up after ${elapsed}s: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    throw err;
  }

  const body = await res.text();
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const trimmed = body.trim();

  log(
    `read body in ${elapsed}s total: ${body.length} chars (${trimmed.length} trimmed)`,
  );

  if (trimmed.length === 0) {
    log("body is empty after trim");
    throw new GallicaFetchError(
      url,
      res.status,
      "texteBrut response body is empty",
    );
  }
  if (/^\s*</.test(trimmed) && /<html|<!doctype/i.test(trimmed)) {
    log(
      `body looks like HTML, not plain OCR. First 200 chars: ${truncateForLog(trimmed, 200)}`,
    );
    throw new GallicaFetchError(
      url,
      res.status,
      "texteBrut returned HTML instead of plain OCR text",
    );
  }
  if (trimmed.length < 200) {
    log(
      `body is suspiciously short (<200 chars). Full text: ${truncateForLog(trimmed, 500)}`,
    );
    throw new GallicaFetchError(
      url,
      res.status,
      `texteBrut body too short (${trimmed.length} chars)`,
    );
  }

  log(`preview: ${truncateForLog(trimmed, 120)}`);

  return body;
}
