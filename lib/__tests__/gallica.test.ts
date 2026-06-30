/**
 * lib/__tests__/gallica.test.ts
 *
 * Unit tests for lib/gallica.ts.
 * All tests use static fixture inputs — no network, R2, or DB calls.
 *
 * Covers:
 *  1. URL builders
 *  2. Date ↔ dayOfYear conversion
 *  3. parseIssuesXml — ARK lookup by date
 *  4. parsePaginationXml — page count extraction
 *  5. parseAltoXml — TextBlock bounding boxes
 *  6. pixelRegion / pctRegion serialization
 *  7. deriveFeuilletonRegion — heuristic gap detection
 */

import { describe, it, expect } from "vitest";
import {
  // URL builders
  issuesServiceUrl,
  paginationServiceUrl,
  iiifImageUrl,
  iiifInfoUrl,
  altoUrl,
  texteBrutUrl,
  gallicaPermalink,
  parseArkFromGallicaUrl,
  pixelRegion,
  pctRegion,
  // Date utilities
  isoToDayOfYear,
  isLeapYear,
  // Parsers
  parseIssuesXml,
  parsePaginationXml,
  parseAltoXml,
  deriveFeuilletonRegion,
  segmentAltoBlocks,
  buildAltoSections,
  stitchAltoBlocks,
  DEBATS_PERIODICAL_ARK,
  type IIIFDimensions,
  type AltoTextBlock,
} from "../gallica";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ISSUES_XML_1844 = `<?xml version="1.0" encoding="UTF-8"?>
<issues compile_time="0:00:01.234" list_type="issue" date="1844"
        parent_ark="ark:/12148/${DEBATS_PERIODICAL_ARK}/date">
  <issue ark="bpt6k440001a" dayOfYear="228">16 août 1844</issue>
  <issue ark="bpt6k446670p" dayOfYear="241">28 août 1844</issue>
  <issue ark="bpt6k440003c" dayOfYear="243">30 août 1844</issue>
  <issue ark="bpt6k440004d" dayOfYear="275">01 octobre 1844</issue>
</issues>`;

// Gallica sometimes emits dayOfYear before ark — test both attribute orders
const ISSUES_XML_REVERSED_ATTRS = `<?xml version="1.0" encoding="UTF-8"?>
<issues list_type="issue" date="1844" parent_ark="ark:/12148/${DEBATS_PERIODICAL_ARK}/date">
  <issue dayOfYear="241" ark="bpt6k446670p">28 août 1844</issue>
</issues>`;

const PAGINATION_XML = `<?xml version="1.0" encoding="UTF-8"?>
<livre nbVuesTotales="4" ark="bpt6k446670p" dateParu="1844-08-28">
  <pages>
    <page numero="1" ordre="1" />
    <page numero="2" ordre="2" />
    <page numero="3" ordre="3" />
    <page numero="4" ordre="4" />
  </pages>
</livre>`;

// Minimal ALTO XML fixture representing the front page of a 4-column newspaper
// with a feuilleton strip at the bottom separated by a clear gap.
const ALTO_XML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<alto xmlns="http://bibnum.bnf.fr/alto_prod/">
  <Description><sourceImageInformation><fileName>bpt6k446670p_f1.jpg</fileName></sourceImageInformation></Description>
  <Layout>
    <Page ID="P1" PHYSICAL_IMG_NR="1" HEIGHT="7600" WIDTH="5200">
      <PrintSpace HPOS="0" VPOS="0" WIDTH="5200" HEIGHT="7600">
        <!-- News column blocks (upper 80% of page) -->
        <TextBlock ID="TB_1" HPOS="100" VPOS="200" WIDTH="1100" HEIGHT="5200">
          <TextLine ID="TL_1" HPOS="100" VPOS="200" WIDTH="1100" HEIGHT="50">
            <String ID="S_1" HPOS="100" VPOS="200" WIDTH="400" HEIGHT="50" CONTENT="PARIS"/>
            <String ID="S_2" HPOS="510" VPOS="200" WIDTH="690" HEIGHT="50" CONTENT="28 août 1844"/>
          </TextLine>
        </TextBlock>
        <TextBlock ID="TB_2" HPOS="1300" VPOS="300" WIDTH="1100" HEIGHT="5000">
          <TextLine ID="TL_2" HPOS="1300" VPOS="300" WIDTH="1100" HEIGHT="50">
            <String ID="S_3" HPOS="1300" VPOS="300" WIDTH="600" HEIGHT="50" CONTENT="Chambre"/>
          </TextLine>
        </TextBlock>
        <TextBlock ID="TB_3" HPOS="2500" VPOS="250" WIDTH="1100" HEIGHT="5100">
          <TextLine ID="TL_3" HPOS="2500" VPOS="250" WIDTH="1100" HEIGHT="50">
            <String ID="S_4" HPOS="2500" VPOS="250" WIDTH="500" HEIGHT="50" CONTENT="Bourse"/>
          </TextLine>
        </TextBlock>
        <!-- 250px gap here (the horizontal rule) before the feuilleton strip -->
        <!-- Feuilleton blocks (bottom ~20% of page, VPOS ~5700+) -->
        <TextBlock ID="TB_feuilleton_1" HPOS="100" VPOS="5950" WIDTH="5000" HEIGHT="200">
          <TextLine ID="TL_f1" HPOS="100" VPOS="5950" WIDTH="5000" HEIGHT="60">
            <String ID="S_f1" HPOS="100" VPOS="5950" WIDTH="800" HEIGHT="60" CONTENT="FEUILLETON"/>
            <String ID="S_f2" HPOS="930" VPOS="5950" WIDTH="600" HEIGHT="60" CONTENT="DU JOURNAL DES DÉBATS"/>
          </TextLine>
        </TextBlock>
        <TextBlock ID="TB_feuilleton_2" HPOS="100" VPOS="6200" WIDTH="5000" HEIGHT="800">
          <TextLine ID="TL_f2" HPOS="100" VPOS="6200" WIDTH="5000" HEIGHT="60">
            <String ID="S_f3" HPOS="100" VPOS="6200" WIDTH="1200" HEIGHT="60" CONTENT="LE COMTE DE MONTE-CRISTO"/>
          </TextLine>
        </TextBlock>
        <TextBlock ID="TB_feuilleton_3" HPOS="100" VPOS="7050" WIDTH="5000" HEIGHT="450">
          <TextLine ID="TL_f3" HPOS="100" VPOS="7050" WIDTH="5000" HEIGHT="60">
            <String ID="S_f4" HPOS="100" VPOS="7050" WIDTH="800" HEIGHT="60" CONTENT="Par Alexandre Dumas."/>
          </TextLine>
        </TextBlock>
      </PrintSpace>
    </Page>
  </Layout>
</alto>`;

// ---------------------------------------------------------------------------
// 1. URL builders
// ---------------------------------------------------------------------------

describe("URL builders", () => {
  it("issuesServiceUrl produces correct URL", () => {
    const url = issuesServiceUrl(DEBATS_PERIODICAL_ARK, 1844);
    expect(url).toBe(
      "https://gallica.bnf.fr/services/Issues?ark=ark:/12148/cb39294634r/date&date=1844",
    );
  });

  it("paginationServiceUrl produces correct URL", () => {
    expect(paginationServiceUrl("bpt6k446670p")).toBe(
      "https://gallica.bnf.fr/services/Pagination?ark=bpt6k446670p",
    );
  });

  it("iiifImageUrl — full page defaults", () => {
    expect(iiifImageUrl("bpt6k446670p", 1)).toBe(
      "https://gallica.bnf.fr/iiif/ark:/12148/bpt6k446670p/f1/full/full/0/native.jpg",
    );
  });

  it("iiifImageUrl — pixel region", () => {
    expect(iiifImageUrl("bpt6k446670p", 1, "100,5950,5000,1500")).toBe(
      "https://gallica.bnf.fr/iiif/ark:/12148/bpt6k446670p/f1/100,5950,5000,1500/full/0/native.jpg",
    );
  });

  it("iiifInfoUrl", () => {
    expect(iiifInfoUrl("bpt6k446670p", 1)).toBe(
      "https://gallica.bnf.fr/iiif/ark:/12148/bpt6k446670p/f1/info.json",
    );
  });

  it("altoUrl", () => {
    expect(altoUrl("bpt6k446670p", 1)).toBe(
      "https://gallica.bnf.fr/RequestDigitalElement?O=bpt6k446670p&E=ALTO&Deb=1",
    );
  });

  it("texteBrutUrl — whole issue", () => {
    expect(texteBrutUrl("bpt6k446670p")).toBe(
      "https://gallica.bnf.fr/ark:/12148/bpt6k446670p.texteBrut",
    );
  });

  it("texteBrutUrl — single page", () => {
    expect(texteBrutUrl("bpt6k446670p", 1)).toBe(
      "https://gallica.bnf.fr/ark:/12148/bpt6k446670p.texteBrutf1n0",
    );
  });

  it("gallicaPermalink", () => {
    expect(gallicaPermalink("bpt6k446670p")).toBe(
      "https://gallica.bnf.fr/ark:/12148/bpt6k446670p",
    );
  });

  it("parseArkFromGallicaUrl", () => {
    expect(
      parseArkFromGallicaUrl("https://gallica.bnf.fr/ark:/12148/bpt6k446668c"),
    ).toBe("bpt6k446668c");
    expect(parseArkFromGallicaUrl("not-a-url")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Date utilities
// ---------------------------------------------------------------------------

describe("Date utilities", () => {
  it("isLeapYear", () => {
    expect(isLeapYear(1844)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1845)).toBe(false);
  });

  it("isoToDayOfYear — non-leap year", () => {
    expect(isoToDayOfYear("1845-01-01")).toBe(1);
    expect(isoToDayOfYear("1845-12-31")).toBe(365);
    expect(isoToDayOfYear("1845-08-28")).toBe(240);
  });

  it("isoToDayOfYear — leap year 1844", () => {
    expect(isoToDayOfYear("1844-01-01")).toBe(1);
    expect(isoToDayOfYear("1844-12-31")).toBe(366);
    // Aug 28 1844 = 31+29+31+30+31+30+31+28 = 241
    expect(isoToDayOfYear("1844-08-28")).toBe(241);
    // Aug 30 1844 = dayOfYear 243
    expect(isoToDayOfYear("1844-08-30")).toBe(243);
  });
});

// ---------------------------------------------------------------------------
// 3. parseIssuesXml
// ---------------------------------------------------------------------------

describe("parseIssuesXml", () => {
  it("finds the correct issue by date", () => {
    const result = parseIssuesXml(ISSUES_XML_1844, "1844-08-28");
    expect(result).not.toBeNull();
    expect(result?.ark).toBe("bpt6k446670p");
    expect(result?.dayOfYear).toBe(241);
  });

  it("returns null for a date with no matching issue", () => {
    const result = parseIssuesXml(ISSUES_XML_1844, "1844-08-29");
    expect(result).toBeNull();
  });

  it("handles reversed attribute order (dayOfYear before ark)", () => {
    const result = parseIssuesXml(ISSUES_XML_REVERSED_ATTRS, "1844-08-28");
    expect(result?.ark).toBe("bpt6k446670p");
  });

  it("handles extra attributes before ark (e.g. compile-time metadata)", () => {
    const xmlWithExtra = `<issues><issue compile="yes" ark="bpt6k446670p" dayOfYear="241">28 août 1844</issue></issues>`;
    const result = parseIssuesXml(xmlWithExtra, "1844-08-28");
    expect(result?.ark).toBe("bpt6k446670p");
  });

  it("finds another date in the same year", () => {
    const result = parseIssuesXml(ISSUES_XML_1844, "1844-10-01");
    expect(result?.ark).toBe("bpt6k440004d");
  });
});

// ---------------------------------------------------------------------------
// 4. parsePaginationXml
// ---------------------------------------------------------------------------

describe("parsePaginationXml", () => {
  it("extracts nbVuesTotales", () => {
    expect(parsePaginationXml(PAGINATION_XML)).toBe(4);
  });

  it("returns null for malformed XML", () => {
    expect(parsePaginationXml("<livre foo='bar'></livre>")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. parseAltoXml
// ---------------------------------------------------------------------------

describe("parseAltoXml", () => {
  it("parses all TextBlocks", () => {
    const blocks = parseAltoXml(ALTO_XML_FIXTURE);
    expect(blocks.length).toBeGreaterThanOrEqual(6);
  });

  it("extracts correct coordinates for the first news block", () => {
    const blocks = parseAltoXml(ALTO_XML_FIXTURE);
    const tb1 = blocks.find((b) => b.id === "TB_1");
    expect(tb1).toBeDefined();
    expect(tb1?.x).toBe(100);
    expect(tb1?.y).toBe(200);
    expect(tb1?.w).toBe(1100);
    expect(tb1?.h).toBe(5200);
  });

  it("extracts text content from String children", () => {
    const blocks = parseAltoXml(ALTO_XML_FIXTURE);
    const tb1 = blocks.find((b) => b.id === "TB_1");
    expect(tb1?.text).toContain("PARIS");
    expect(tb1?.text).toContain("28 août 1844");
  });

  it("extracts feuilleton blocks with correct coordinates", () => {
    const blocks = parseAltoXml(ALTO_XML_FIXTURE);
    const feuilHead = blocks.find((b) => b.id === "TB_feuilleton_1");
    expect(feuilHead).toBeDefined();
    expect(feuilHead?.y).toBe(5950);
    expect(feuilHead?.text).toContain("FEUILLETON");
  });

  it("returns empty array for empty / malformed XML", () => {
    expect(parseAltoXml("")).toHaveLength(0);
    expect(parseAltoXml("<not-alto></not-alto>")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. pixelRegion / pctRegion
// ---------------------------------------------------------------------------

describe("region serializers", () => {
  it("pixelRegion rounds and serializes", () => {
    expect(pixelRegion({ x: 100.4, y: 5949.7, w: 5000.1, h: 1550.9 })).toBe(
      "100,5950,5000,1551",
    );
  });

  it("pctRegion serializes", () => {
    expect(pctRegion(0, 78, 100, 22)).toBe("pct:0,78,100,22");
  });
});

// ---------------------------------------------------------------------------
// 7. deriveFeuilletonRegion
// ---------------------------------------------------------------------------

describe("deriveFeuilletonRegion", () => {
  const PAGE: IIIFDimensions = { width: 5200, height: 7600 };

  it("detects the feuilleton region from fixture ALTO data", () => {
    const blocks = parseAltoXml(ALTO_XML_FIXTURE);
    const region = deriveFeuilletonRegion(blocks, PAGE);
    expect(region).not.toBeNull();
    // Should start at ~5950 (top of first feuilleton block)
    expect(region!.y).toBeGreaterThanOrEqual(5900);
    // Should be in the bottom half of the page
    expect(region!.y).toBeGreaterThan(PAGE.height / 2);
    // Should span close to full width
    expect(region!.w).toBeGreaterThan(4000);
  });

  it("returns null when gap is too small to qualify", () => {
    // All blocks tightly packed — no clear feuilleton gap
    const tightBlocks = [
      { id: "b1", x: 0, y: 0, w: 100, h: 100, text: "a" },
      { id: "b2", x: 0, y: 105, w: 100, h: 100, text: "b" }, // 5px gap
      { id: "b3", x: 0, y: 210, w: 100, h: 100, text: "c" }, // 5px gap
    ];
    expect(deriveFeuilletonRegion(tightBlocks, PAGE)).toBeNull();
  });

  it("returns null when the detected gap is in the upper half of the page", () => {
    // Gap in upper half — not a feuilleton separator
    const upperGapBlocks = [
      { id: "b1", x: 0, y: 100, w: 100, h: 500, text: "a" },
      // large gap at ~600, but that's only 8% down the page
      { id: "b2", x: 0, y: 1000, w: 100, h: 6500, text: "b" },
    ];
    expect(deriveFeuilletonRegion(upperGapBlocks, PAGE)).toBeNull();
  });

  it("returns null for fewer than 2 blocks", () => {
    expect(deriveFeuilletonRegion([], PAGE)).toBeNull();
    expect(
      deriveFeuilletonRegion(
        [{ id: "b1", x: 0, y: 0, w: 100, h: 100, text: "x" }],
        PAGE,
      ),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. segmentAltoBlocks / buildAltoSections / stitchAltoBlocks
//    Reading-order reconstruction from block geometry. Fixtures mirror real
//    Débats geometry: columns whose boxes abut/overlap in x (no blank gutter),
//    and a feuilleton strip whose blocks are one-per-column (not full width).
// ---------------------------------------------------------------------------

const blk = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  text?: string,
): AltoTextBlock => ({ id, x, y, w, h, text: text ?? id });

describe("segmentAltoBlocks", () => {
  it("orders abutting columns column-major, not row-major (the core bug)", () => {
    // col1 right edge 120 overlaps col2 left edge 100, so blank-gutter
    // detection fails. A y-primary sort yields A,B,C; column clustering must
    // yield A,C (col1) then B (col2). col2 spans both rows so no false y-gap.
    const A = blk("A", 0, 0, 120, 100); // col1 top
    const C = blk("C", 0, 110, 120, 100); // col1 bottom
    const B = blk("B", 100, 0, 120, 210); // col2, spans both rows
    expect(stitchAltoBlocks([B, A, C], 220, 210)).toBe("A\nC\nB");
  });

  it("separates the bottom feuilleton strip into its own band", () => {
    // News columns stagger (no full-width y-gap); the only gap is the rule
    // above the feuilleton. Reading order: news col1, news col2, then the
    // feuilleton columns left-to-right.
    const a = blk("a", 0, 0, 120, 100); // col1 news
    const c = blk("c", 0, 110, 120, 90); // col1 news
    const b = blk("b", 100, 0, 120, 205); // col2 news (spans the news band)
    const e = blk("e", 0, 260, 120, 50); // col1 feuilleton
    const f = blk("f", 100, 260, 120, 50); // col2 feuilleton
    const sections = segmentAltoBlocks([e, f, b, a, c], 220, 310);
    expect(sections.map((s) => s.map((x) => x.id).join(""))).toEqual([
      "ac",
      "b",
      "e",
      "f",
    ]);
  });

  it("returns [] for no blocks and one section for a single block", () => {
    expect(segmentAltoBlocks([], 100, 100)).toEqual([]);
    expect(segmentAltoBlocks([blk("x", 0, 0, 10, 10)], 100, 100)).toEqual([
      [blk("x", 0, 0, 10, 10)],
    ]);
  });
});

describe("buildAltoSections", () => {
  it("emits page-percentage regions per section", () => {
    const sections = buildAltoSections(
      [blk("A", 0, 0, 100, 100), blk("B", 100, 0, 100, 100)],
      200,
      400,
    );
    expect(sections).toHaveLength(2);
    // col1: x 0%, w 100/200=50%, h 100/400=25%
    expect(sections[0].region).toEqual({ x: 0, y: 0, w: 50, h: 25 });
    expect(sections[1].region).toEqual({ x: 50, y: 0, w: 50, h: 25 });
  });
});
