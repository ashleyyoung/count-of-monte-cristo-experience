import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildNameIndex,
  linkNamesInText,
  type LinkablePerson,
} from "@/lib/people-linker";

const PEOPLE: LinkablePerson[] = [
  {
    id: "1",
    name: "Hector Berlioz",
    slug: "hector-berlioz",
    beat: "music",
    birth: 1803,
    death: 1869,
    tagline: "Composer and critic",
  },
  {
    id: "2",
    name: "Jules Janin",
    slug: "jules-janin",
    beat: "drama",
    birth: 1804,
    death: 1874,
    tagline: "Theatre critic",
  },
  {
    id: "3",
    name: "Alexandre Dumas",
    slug: "alexandre-dumas",
    beat: "literature",
    birth: 1802,
    death: 1870,
    tagline: null,
  },
];

function markup(node: React.ReactNode): string {
  return renderToStaticMarkup(React.createElement(React.Fragment, null, node));
}

describe("buildNameIndex", () => {
  it("prefers the longest matching name", () => {
    const index = buildNameIndex(PEOPLE);
    const seen = new Set<string>();
    const out = linkNamesInText(
      "Hector Berlioz reviewed the opera.",
      index,
      seen,
      "t",
    );
    expect(markup(out)).toContain("Hector Berlioz");
    expect(markup(out)).toContain('href="/people/hector-berlioz"');
  });

  it("links a unique surname when distinctive enough", () => {
    const index = buildNameIndex(PEOPLE);
    const seen = new Set<string>();
    const out = linkNamesInText("Janin wrote on Monday.", index, seen, "t");
    expect(markup(out)).toContain('href="/people/jules-janin"');
  });

  it("does not link ambiguous surnames shared by multiple people", () => {
    const dupes: LinkablePerson[] = [
      ...PEOPLE,
      {
        id: "4",
        name: "Thomas-Alexandre Dumas",
        slug: "thomas-alexandre-dumas",
        beat: null,
        birth: 1762,
        death: 1806,
        tagline: null,
      },
    ];
    const index = buildNameIndex(dupes);
    const seen = new Set<string>();
    const out = linkNamesInText(
      "Dumas wrote the feuilleton.",
      index,
      seen,
      "t",
    );
    expect(markup(out)).toBe("Dumas wrote the feuilleton.");
  });

  it("does not match inside a longer word", () => {
    const index = buildNameIndex(PEOPLE);
    const seen = new Set<string>();
    const out = linkNamesInText("Janine attended.", index, seen, "t");
    expect(markup(out)).toBe("Janine attended.");
  });
});

describe("linkNamesInText", () => {
  it("links only the first mention of each person per seen set", () => {
    const index = buildNameIndex(PEOPLE);
    const seen = new Set<string>();
    const first = linkNamesInText(
      "Jules Janin and Hector Berlioz met.",
      index,
      seen,
      "a",
    );
    const second = linkNamesInText(
      "Janin and Berlioz met again.",
      index,
      seen,
      "b",
    );
    expect(markup(first).match(/href="/g)?.length).toBe(2);
    expect(markup(second)).toBe("Janin and Berlioz met again.");
  });

  it("returns plain text when the index is empty", () => {
    const index = buildNameIndex([]);
    const seen = new Set<string>();
    expect(linkNamesInText("Jules Janin wrote.", index, seen, "t")).toBe(
      "Jules Janin wrote.",
    );
  });
});
