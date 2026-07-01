import { describe, expect, it } from "vitest";
import { cleanGalignaniOcr } from "@/lib/galignani/clean-ocr";
import {
  listGalignaniOcrPages,
  listGalignaniOtherItems,
  parseGalignaniOcrPageNumber,
} from "@/lib/galignani/pages";
import { structureGalignaniOcr } from "@/lib/galignani/structure-ocr";
import type { ResolvedDocItem, ResolvedTextItem } from "@/lib/content";

function textItem(
  slot_key: string | undefined,
  text = "sample",
): ResolvedTextItem {
  return {
    kind: "text",
    text,
    source: "Galignani's Messenger",
    original_date: "1844-08-28",
    gallica_url: "https://example.com",
    license: "Public Domain",
    attribution: "test",
    slot_key,
  };
}

describe("cleanGalignaniOcr", () => {
  it("joins hyphenated line breaks", () => {
    expect(cleanGalignaniOcr("com-\nforts")).toBe("comforts");
  });

  it("drops financial noise rows", () => {
    const raw = "£3,108 1,836 4,325\nReal prose with enough words here.";
    const out = cleanGalignaniOcr(raw);
    expect(out).not.toContain("£3,108");
    expect(out).toContain("Real prose");
  });

  it("drops column fragment lines", () => {
    const raw = "y of- ety, a ents ply to\nPARIS, AUGUST 28, 1844.";
    const out = cleanGalignaniOcr(raw);
    expect(out).not.toContain("ents ply");
    expect(out).toContain("PARIS, AUGUST 28, 1844.");
  });
});

describe("structureGalignaniOcr", () => {
  it("classifies mid-line WANTED as ad_lead not heading", () => {
    const line =
      "TO DRAPERS and SILK-MERCERS. WANTED, bva respectable young English man";
    const blocks = structureGalignaniOcr(line);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("ad_lead");
  });

  it("classifies short standalone dateline", () => {
    const blocks = structureGalignaniOcr("PARIS, AUGUST 28, 1844.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("dateline");
  });

  it("treats jammed dateline+paragraph as paragraph", () => {
    const line =
      "PARIS, AUGUST 28, 1844. We yesterday received the London morning papers of Monday by Express, through Brighton and Dieppe, bringing intelligence from the United States.";
    const blocks = structureGalignaniOcr(line);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("paragraph");
  });

  it("merges consecutive blockquote lines", () => {
    const raw =
      '" I received this morning at half paist six,\nby Djemma zaonat, a despatch from the Prince.';
    const blocks = structureGalignaniOcr(raw);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("blockquote");
    expect(blocks[0].text).toContain("despatch");
  });

  it("produces multiple blocks from multi-line input", () => {
    const raw = [
      "LE CIRCULAR NOTES.",
      "UNION BANK OF LONDON. The Directors give notice.",
      "PARIS, AUGUST 28, 1844.",
    ].join("\n");
    const blocks = structureGalignaniOcr(raw);
    expect(blocks.length).toBeGreaterThan(1);
  });

  it("returns empty for blank input", () => {
    expect(structureGalignaniOcr("")).toEqual([]);
  });
});

describe("galignani page helpers", () => {
  const items: ResolvedDocItem[] = [
    { kind: "image", url: "x", caption: "scan" },
    textItem("galignani-text-page-2", "p2"),
    textItem("galignani-text-page-1", "p1"),
    textItem(undefined, "curated"),
  ];

  it("parseGalignaniOcrPageNumber reads slot_key", () => {
    expect(parseGalignaniOcrPageNumber(textItem("galignani-text-page-3"))).toBe(
      3,
    );
    expect(parseGalignaniOcrPageNumber(textItem(undefined))).toBeNull();
  });

  it("listGalignaniOcrPages sorts by page number", () => {
    const pages = listGalignaniOcrPages(items);
    expect(pages.map((p) => p.text)).toEqual(["p1", "p2"]);
  });

  it("listGalignaniOtherItems excludes paged OCR", () => {
    const other = listGalignaniOtherItems(items);
    expect(other).toHaveLength(1);
    expect(other[0].kind).toBe("text");
    if (other[0].kind === "text") expect(other[0].text).toBe("curated");
  });
});
