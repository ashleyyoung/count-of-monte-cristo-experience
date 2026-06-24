import { describe, it, expect } from "vitest";
import {
  findGutenbergContentStart,
  splitIntoChapters,
} from "@/lib/gutenberg-split";

const FIXTURE = `*** START ***

Contents

 VOLUME ONE
Chapter 1. Marseilles—The Arrival
Chapter 2. Father and Son
Chapter 3. The Catalans

VOLUME ONE

 Chapter 1. Marseilles—The Arrival

On the 24th of February, 1815, the look-out signalled the _Pharaon_.

More prose for chapter one.

 Chapter 2. Father and Son

On the following day, the old man awoke.

 Chapter 3. The Catalans

One fine morning, a young man.
`;

describe("findGutenbergContentStart", () => {
  it("skips the table of contents before VOLUME ONE body", () => {
    const start = findGutenbergContentStart(FIXTURE);
    expect(FIXTURE.slice(start, start + 30)).toMatch(/Chapter 1\. Marseilles/);
  });
});

describe("splitIntoChapters", () => {
  it("extracts prose bodies, not TOC-only headings", () => {
    const chapters = splitIntoChapters(FIXTURE);
    expect(chapters).toHaveLength(3);
    expect(chapters[0].numRoman).toBe("I");
    expect(chapters[0].body).toContain("look-out signalled the _Pharaon_");
    expect(chapters[1].numRoman).toBe("II");
    expect(chapters[1].body).toContain("old man awoke");
  });
});
