"use client";

/**
 * lib/people-linker.tsx
 *
 * Turns recognized people's names inside prose into profile hover cards, so the
 * day's clippings become a connected web of recurring figures.
 *
 * - A NameIndex is built once from the full people registry (buildNameIndex).
 * - linkNamesInText scans a plain text segment and wraps matches in
 *   <PersonHoverCard>, preserving the exact words as written.
 * - Matching is case-sensitive against the registry's exact name forms, so
 *   lowercase common words never match. Full names always link; a bare surname
 *   links only when it is unique in the registry and reasonably distinctive.
 * - Only the first mention of each person per text item links (tracked via a
 *   caller-owned `seen` set), to avoid a wall of links.
 *
 * Provided to the prose renderer through React context (PeopleIndexProvider /
 * usePeopleIndex) so call sites don't have to thread the registry by hand.
 */

import React, { createContext, useContext, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import PersonHoverCard, {
  type PersonHoverCardPerson,
} from "@/components/people/PersonHoverCard";
import type { LinkPlain } from "@/lib/render-prose";

export interface LinkablePerson extends PersonHoverCardPerson {
  id: string;
}

export interface NameIndex {
  regex: RegExp | null;
  byKey: Map<string, LinkablePerson>;
}

const MIN_FULL_NAME_LEN = 3;
const MIN_SURNAME_LEN = 4;

function lastToken(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? "";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildNameIndex(people: LinkablePerson[]): NameIndex {
  const byKey = new Map<string, LinkablePerson>();

  // Count surnames so we only link a bare surname when it's unambiguous.
  const surnameCount = new Map<string, number>();
  for (const p of people) {
    const s = lastToken(p.name);
    if (s) surnameCount.set(s, (surnameCount.get(s) ?? 0) + 1);
  }

  const addKey = (key: string, p: LinkablePerson) => {
    if (key && !byKey.has(key)) byKey.set(key, p);
  };

  for (const p of people) {
    const full = p.name.trim();
    if (full.length >= MIN_FULL_NAME_LEN) addKey(full, p);

    const surname = lastToken(p.name);
    if (
      surname.length >= MIN_SURNAME_LEN &&
      surnameCount.get(surname) === 1
    ) {
      addKey(surname, p);
    }
  }

  const keys = [...byKey.keys()];
  if (keys.length === 0) return { regex: null, byKey };

  // Longest first so "Hector Berlioz" wins over "Berlioz".
  keys.sort((a, b) => b.length - a.length);
  const pattern = keys.map(escapeRegExp).join("|");
  // Unicode-aware boundaries; case-sensitive (no `i` flag).
  const regex = new RegExp(
    `(?<![\\p{L}\\p{N}])(${pattern})(?![\\p{L}\\p{N}])`,
    "gu",
  );
  return { regex, byKey };
}

export function linkNamesInText(
  text: string,
  index: NameIndex,
  seen: Set<string>,
  keyPrefix: string,
): ReactNode {
  if (!index.regex || !text) return text;

  index.regex.lastIndex = 0;
  const out: ReactNode[] = [];
  let last = 0;
  let made = 0;
  let m: RegExpExecArray | null;

  while ((m = index.regex.exec(text)) !== null) {
    const matched = m[1];
    const person = index.byKey.get(matched);
    if (person && !seen.has(person.slug)) {
      if (m.index > last) out.push(text.slice(last, m.index));
      seen.add(person.slug);
      out.push(
        <PersonHoverCard key={`${keyPrefix}-pl-${made}`} person={person}>
          {matched}
        </PersonHoverCard>,
      );
      last = m.index + matched.length;
      made++;
    }
    // Already-seen or unknown matches fall through; their text is captured by
    // the next slice (or the trailing slice below).
  }

  if (made === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PeopleIndexContext = createContext<NameIndex | null>(null);

export function PeopleIndexProvider({
  people,
  children,
}: {
  people: LinkablePerson[];
  children: React.ReactNode;
}) {
  const index = useMemo(() => buildNameIndex(people), [people]);
  return (
    <PeopleIndexContext.Provider value={index}>
      {children}
    </PeopleIndexContext.Provider>
  );
}

export function usePeopleIndex(): NameIndex | null {
  return useContext(PeopleIndexContext);
}

/**
 * Returns a LinkPlain callback for pickProseRenderer, linking the first mention
 * of each recognized person per render. Set `enabled: false` for fiction prose.
 */
export function usePeopleLinkPlain(opts?: { enabled?: boolean }): LinkPlain | undefined {
  const enabled = opts?.enabled ?? true;
  const index = usePeopleIndex();
  const seenRef = useRef<Set<string>>(new Set());

  return useMemo(() => {
    if (!enabled || !index?.regex) return undefined;
    const seen = seenRef.current;
    seen.clear();
    return (text: string, keyPrefix: string) =>
      linkNamesInText(text, index, seen, keyPrefix);
  }, [enabled, index, index?.regex]);
}
