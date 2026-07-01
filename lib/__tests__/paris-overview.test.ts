import { describe, it, expect } from "vitest";
import {
  extractJsonFromModelOutput,
  parseParisOverview,
} from "../types/paris-overview";

describe("parseParisOverview", () => {
  const sample = {
    version: 1 as const,
    sections: [
      {
        id: "news" as const,
        title: "News & Politics",
        summary:
          "The ministry faces a no-confidence debate. Spain dominates the cables.",
      },
      {
        id: "science" as const,
        title: "Science",
        summary: "Foucault reports on his pendulum experiments.",
      },
    ],
    noteworthy: [
      { text: "A Paris jeweller is robbed at gunpoint on the rue de la Paix.", section: "news" as const },
      { text: "The Opéra announces a new ballet for September.", section: "music" as const },
    ],
  };

  it("parses bare JSON", () => {
    expect(parseParisOverview(JSON.stringify(sample))).toEqual(sample);
  });

  it("parses fenced JSON", () => {
    const fenced = "```json\n" + JSON.stringify(sample) + "\n```";
    expect(parseParisOverview(fenced)).toEqual(sample);
  });

  it("returns null for legacy prose", () => {
    expect(
      parseParisOverview("Paris woke to another busy morning…"),
    ).toBeNull();
  });
});

describe("extractJsonFromModelOutput", () => {
  it("unwraps json fences", () => {
    expect(extractJsonFromModelOutput('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});
