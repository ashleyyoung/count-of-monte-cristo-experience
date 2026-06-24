import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  renderClaudeTranslationInline,
  renderPublicDomainInline,
  pickProseRenderer,
} from "@/lib/render-prose";

function markup(
  node: ReturnType<typeof renderClaudeTranslationInline>,
): string {
  return renderToStaticMarkup(React.createElement(React.Fragment, null, node));
}

describe("renderPublicDomainInline", () => {
  it("renders underscore italics", () => {
    expect(markup(renderPublicDomainInline("the _Pharaon_ sailed"))).toBe(
      "the <em>Pharaon</em> sailed",
    );
  });

  it("renders single-asterisk italics", () => {
    expect(markup(renderPublicDomainInline("read *The Times* today"))).toBe(
      "read <em>The Times</em> today",
    );
  });

  it("leaves double-asterisk bold literal", () => {
    expect(markup(renderPublicDomainInline("**Great Britain.**"))).toBe(
      "**Great Britain.**",
    );
  });
});

describe("renderClaudeTranslationInline", () => {
  it("renders bold section titles", () => {
    expect(markup(renderClaudeTranslationInline("**Great Britain.**"))).toBe(
      "<strong>Great Britain.</strong>",
    );
  });

  it("renders asterisk italics", () => {
    expect(markup(renderClaudeTranslationInline("*The Times*"))).toBe(
      "<em>The Times</em>",
    );
  });

  it("renders underscore italics", () => {
    expect(markup(renderClaudeTranslationInline("_Véloce_"))).toBe(
      "<em>Véloce</em>",
    );
  });

  it("styles gloss brackets as editorial aside", () => {
    const html = markup(
      renderClaudeTranslationInline(
        "the prince de Joinville [son of King Louis-Philippe] arrived",
      ),
    );
    expect(html).toContain("[son of King Louis-Philippe]");
    expect(html).toContain("font-style:italic");
    expect(html).toContain("var(--ink-muted)");
    expect(html).not.toContain("<a ");
  });

  it("handles mixed inline formatting", () => {
    const html = markup(
      renderClaudeTranslationInline("before **bold** after *italic* end"),
    );
    expect(html).toBe("before <strong>bold</strong> after <em>italic</em> end");
  });

  it("renders italic inside bold masthead headers", () => {
    const html = markup(
      renderClaudeTranslationInline(
        "**FEUILLETON of the *Journal des Débats***",
      ),
    );
    expect(html).toBe(
      "<strong>FEUILLETON of the <em>Journal des Débats</em></strong>",
    );
  });
});

describe("pickProseRenderer", () => {
  it("selects Claude renderer for machine_claude", () => {
    expect(pickProseRenderer("machine_claude")).toBe(
      renderClaudeTranslationInline,
    );
  });

  it("selects public-domain renderer for existing_published", () => {
    expect(pickProseRenderer("existing_published")).toBe(
      renderPublicDomainInline,
    );
  });

  it("defaults to public-domain renderer when origin is undefined", () => {
    expect(pickProseRenderer(undefined)).toBe(renderPublicDomainInline);
  });
});
