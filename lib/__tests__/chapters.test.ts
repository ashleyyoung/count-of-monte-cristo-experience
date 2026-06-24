import { describe, it, expect } from "vitest";
import {
  chapterNumFromR2Key,
  chapterTabLabel,
  resolveActiveChapterNum,
  resolveChapterItemIndex,
} from "@/lib/chapters";
import type { DocItem } from "@/lib/types/content";

describe("chapterNumFromR2Key", () => {
  it("extracts Roman numerals from Gutenberg keys", () => {
    expect(chapterNumFromR2Key("gutenberg/chapters/II.txt")).toBe("II");
    expect(chapterNumFromR2Key("gutenberg/chapters/cxvii.txt")).toBe("CXVII");
  });
});

describe("chapterTabLabel", () => {
  it("uses singular and plural labels", () => {
    expect(chapterTabLabel(1)).toBe("Chapter");
    expect(chapterTabLabel(2)).toBe("Chapters");
  });
});

describe("resolveActiveChapterNum", () => {
  const chapters = [
    { num: "I", title: "Arrival", cont: false },
    { num: "II", title: "Father and Son", cont: false },
  ];

  it("defaults to the first chapter when param is missing", () => {
    expect(resolveActiveChapterNum(chapters, null)).toBe("I");
  });

  it("honours a valid chapter param", () => {
    expect(resolveActiveChapterNum(chapters, "II")).toBe("II");
  });
});

describe("resolveChapterItemIndex", () => {
  const items: DocItem[] = [
    {
      kind: "text",
      text_r2_key: "gutenberg/chapters/I.txt",
      source: "Project Gutenberg",
      original_date: "1844-08-28",
      gallica_url: "https://www.gutenberg.org/ebooks/1184",
      license: "Public Domain",
      attribution: "Dumas",
    },
    {
      kind: "text",
      text_r2_key: "gutenberg/chapters/II.txt",
      source: "Project Gutenberg",
      original_date: "1844-08-28",
      gallica_url: "https://www.gutenberg.org/ebooks/1184",
      license: "Public Domain",
      attribution: "Dumas",
    },
  ];

  it("matches by R2 key", () => {
    expect(resolveChapterItemIndex(items, "II", 0)).toBe(1);
  });
});
