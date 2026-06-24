export interface ChapterBlock {
  numRoman: string;
  title: string;
  body: string;
}

/**
 * Locates where chapter bodies begin in Gutenberg #1184.
 * The file opens with a full table of contents (every "Chapter N. Title" on
 * consecutive lines), then "VOLUME ONE", then the actual prose.
 */
export function findGutenbergContentStart(text: string): number {
  const marker = "\nVOLUME ONE\n";
  const idx = text.indexOf(marker);
  if (idx >= 0) {
    return idx + marker.length;
  }

  // Fallback: first "Chapter 1." in TOC vs second in body
  const first = text.search(/^Chapter 1\./m);
  if (first < 0) return 0;
  const second = text.indexOf("Chapter 1.", first + 1);
  return second >= 0 ? second : 0;
}

function stripVolumeMarkers(body: string): string {
  return body
    .replace(/\n+VOLUME (?:ONE|TWO|THREE|FOUR|FIVE)\s*\n+/gi, "\n\n")
    .trim();
}

function toRoman(n: number): string {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = [
    "M",
    "CM",
    "D",
    "CD",
    "C",
    "XC",
    "L",
    "XL",
    "X",
    "IX",
    "V",
    "IV",
    "I",
  ];
  let result = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) {
      result += syms[i];
      n -= vals[i];
    }
  }
  return result;
}

/**
 * Splits the raw Gutenberg text into chapter blocks.
 */
export function splitIntoChapters(raw: string): ChapterBlock[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const contentStart = findGutenbergContentStart(text);
  const content = text.slice(contentStart);

  const parts = content.split(
    /^[\s]*((?:CHAPTER|Chapter)\s+(?:[IVXLCDM]+|\d+)[.\s]+.+)$/m,
  );

  const chapters: ChapterBlock[] = [];

  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i].trim();
    const body = stripVolumeMarkers((parts[i + 1] ?? "").trim());

    const m = heading.match(
      /^(?:CHAPTER|Chapter)\s+([IVXLCDM]+|\d+)[.\s]+(.+)/,
    );
    if (!m) continue;

    let numRoman = m[1];
    const title = m[2].replace(/[.]+$/, "").trim();

    if (/^\d+$/.test(numRoman)) {
      numRoman = toRoman(parseInt(numRoman, 10));
    }

    if (!body) continue;

    chapters.push({ numRoman, title, body });
  }

  return chapters;
}
