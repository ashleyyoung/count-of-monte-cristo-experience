/**
 * lib/installments.ts
 *
 * Typed loaders for the serialization schedule.
 * Reads from content/schedule.json — the output of scripts/parse-schedule.ts.
 * Does not touch Supabase; pure in-memory operations over the static JSON.
 *
 * Navigation helpers (getNext / getPrev) handle:
 *  - Part boundaries (last in Part 1 → first in Part 2)
 *  - The seven-month hiatus (last in Part 2 → first in Part 3)
 *  - The final installment (getNext returns null)
 */

import schedule from "@/content/schedule.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Chapter {
  num: string;
  title: string;
  cont: boolean;
}

export interface Installment {
  date: string;
  part: 1 | 2 | 3 | 4;
  part_index: number;
  global_index: number;
  label: string;
  chapters: Chapter[];
  is_hiatus_after: boolean;
}

export interface SchedulePart {
  part: 1 | 2 | 3 | 4;
  label: string;
  date_range: string;
  chapter_range: string;
  installments: Installment[];
}

// ---------------------------------------------------------------------------
// Cached data (module-level singleton from static JSON)
// ---------------------------------------------------------------------------

const _installments: Installment[] = schedule.installments as Installment[];
const _parts: SchedulePart[] = schedule.parts as SchedulePart[];

/** Map from ISO date string to Installment — O(1) lookup. */
const _byDate = new Map<string, Installment>(
  _installments.map((inst) => [inst.date, inst]),
);

/** Map from global_index to Installment — O(1) lookup by index. */
const _byIndex = new Map<number, Installment>(
  _installments.map((inst) => [inst.global_index, inst]),
);

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

/** All 139 installments in chronological order. */
export function getAll(): Installment[] {
  return _installments;
}

/**
 * Installment by ISO date string ("1844-08-28").
 * Returns undefined if no installment exists for that date.
 */
export function getByDate(date: string): Installment | undefined {
  return _byDate.get(date);
}

/**
 * All installments for a given part (1–4) in chronological order.
 */
export function getByPart(part: 1 | 2 | 3 | 4): Installment[] {
  const p = _parts.find((x) => x.part === part);
  return p ? (p.installments as Installment[]) : [];
}

/**
 * Next installment after the given date, or null if this is the last one.
 * Correctly crosses part and hiatus boundaries.
 */
export function getNext(date: string): Installment | null {
  const current = _byDate.get(date);
  if (!current) return null;
  return _byIndex.get(current.global_index + 1) ?? null;
}

/**
 * Previous installment before the given date, or null if this is the first one.
 * Correctly crosses part and hiatus boundaries.
 */
export function getPrev(date: string): Installment | null {
  const current = _byDate.get(date);
  if (!current) return null;
  return _byIndex.get(current.global_index - 1) ?? null;
}

/**
 * The very first installment (28 August 1844).
 */
export function getFirst(): Installment {
  return _installments[0];
}

/**
 * The very last installment (16 January 1846).
 */
export function getLast(): Installment {
  return _installments[_installments.length - 1];
}

/**
 * Whether a given date string corresponds to any installment.
 */
export function isInstallmentDate(date: string): boolean {
  return _byDate.has(date);
}

/**
 * Part metadata only (no installment bodies) — useful for part headers/labels.
 */
export function getParts(): Omit<SchedulePart, "installments">[] {
  return _parts.map(({ part, label, date_range, chapter_range }) => ({
    part,
    label,
    date_range,
    chapter_range,
  }));
}
