/**
 * lib/__tests__/translate-sections.test.ts
 *
 * Unit tests for section-aware page translation helpers (pure parsing/prompt
 * logic only — no Anthropic client, network, R2, or DB calls).
 */

import { describe, it, expect } from "vitest";
import {
  buildSectionedPageUserPrompt,
  parseSectionedTranslation,
} from "../llm/translate";

describe("buildSectionedPageUserPrompt", () => {
  it("emits one @@@COLUMN_n@@@ marker per section, in order", () => {
    const prompt = buildSectionedPageUserPrompt("1844-09-01", 1, [
      "Texte un.",
      "Texte deux.",
      "Texte trois.",
    ]);
    expect(prompt).toContain("@@@COLUMN_0@@@");
    expect(prompt).toContain("@@@COLUMN_1@@@");
    expect(prompt).toContain("@@@COLUMN_2@@@");
    // markers precede their French
    expect(prompt.indexOf("@@@COLUMN_0@@@")).toBeLessThan(
      prompt.indexOf("Texte un."),
    );
    expect(prompt.indexOf("Texte un.")).toBeLessThan(
      prompt.indexOf("@@@COLUMN_1@@@"),
    );
  });
});

describe("parseSectionedTranslation", () => {
  it("splits a well-formed response 1:1", () => {
    const english = `@@@COLUMN_0@@@
First column.

@@@COLUMN_1@@@
Second column.

@@@COLUMN_2@@@
Third column.`;
    expect(parseSectionedTranslation(english, 3)).toEqual([
      "First column.",
      "Second column.",
      "Third column.",
    ]);
  });

  it("returns null when the marker count is wrong (model dropped one)", () => {
    const english = `@@@COLUMN_0@@@
First column.

@@@COLUMN_1@@@
Second column.`;
    expect(parseSectionedTranslation(english, 3)).toBeNull();
  });

  it("returns null when there are no markers at all", () => {
    expect(parseSectionedTranslation("Just prose, no markers.", 2)).toBeNull();
  });
});
