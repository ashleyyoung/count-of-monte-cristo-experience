/**
 * Per-source inline prose renderers for day-content text items.
 *
 * Branch on translation_origin at the call site (TabPrimitives, TranslationHistory).
 * - machine_claude: Markdown per the translation system prompt (**bold**, *italic*, [gloss])
 * - existing_published / staff / undefined: Gutenberg-style _underscore_ and *italic* only
 */

import type { CSSProperties, ReactNode } from "react";

/**
 * Optional hook to transform a plain (non-emphasis) text segment — used to wrap
 * recognized people's names in profile hover cards. Receives a stable key prefix
 * so any injected elements get React keys. Returns the segment unchanged when
 * there is nothing to link.
 */
export type LinkPlain = (text: string, keyPrefix: string) => ReactNode;

const PUBLIC_DOMAIN_INLINE =
  /(_[^_\n]+_|(?<!\*)\*[^*\n]+\*(?!\*))/g;

/** Bold spans may contain single-asterisk italics inside, e.g. **FEUILLETON of the *Journal des Débats*** */
const CLAUDE_BOLD = /\*\*(.+?)\*\*(?=[^*]|$)/g;

const CLAUDE_INNER = /(\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\])/g;

/** Gutenberg / hberlioz / staff: _underscore_ and *italic* only; ** stays literal. */
export function renderPublicDomainInline(
  text: string,
  linkPlain?: LinkPlain,
): ReactNode {
  const parts = text.split(PUBLIC_DOMAIN_INLINE);
  return parts.map((part, j) => {
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return <em key={j}>{part.slice(1, -1)}</em>;
    }
    if (
      part.startsWith("*") &&
      part.endsWith("*") &&
      part.length > 2 &&
      !part.startsWith("**")
    ) {
      return <em key={j}>{part.slice(1, -1)}</em>;
    }
    return linkPlain ? linkPlain(part, String(j)) : part;
  });
}

function renderClaudeInner(
  text: string,
  keyPrefix = "",
  linkPlain?: LinkPlain,
): ReactNode {
  const parts = text.split(CLAUDE_INNER);
  return parts.map((part, j) => {
    const key = `${keyPrefix}${j}`;
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("[") && part.endsWith("]")) {
      return (
        <span
          key={key}
          style={{ fontStyle: "italic", color: "var(--ink-muted)" }}
        >
          {part}
        </span>
      );
    }
    return linkPlain ? linkPlain(part, key) : part;
  });
}

/** Claude machine translations: full inline Markdown from the translation prompt. */
export function renderClaudeTranslationInline(
  text: string,
  linkPlain?: LinkPlain,
): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const boldRe = new RegExp(CLAUDE_BOLD.source, "g");
  let match: RegExpExecArray | null;

  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        renderClaudeInner(text.slice(lastIndex, match.index), `${lastIndex}-`, linkPlain),
      );
    }
    nodes.push(
      <strong key={match.index}>
        {renderClaudeInner(match[1], `${match.index}-`, linkPlain)}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(renderClaudeInner(text.slice(lastIndex), `${lastIndex}-`, linkPlain));
  }

  if (nodes.length === 0) {
    return renderClaudeInner(text, "", linkPlain);
  }
  if (nodes.length === 1) {
    return nodes[0];
  }
  return nodes;
}

export type ProseInlineRenderer = (text: string) => ReactNode;

export function pickProseRenderer(
  translationOrigin: string | undefined,
  linkPlain?: LinkPlain,
): ProseInlineRenderer {
  const base =
    translationOrigin === "machine_claude"
      ? renderClaudeTranslationInline
      : renderPublicDomainInline;
  // Preserve the bare function reference when there's nothing to link (keeps
  // referential equality that callers/tests rely on).
  if (!linkPlain) return base;
  return (text: string) => base(text, linkPlain);
}

const RUBRIC_BASE: CSSProperties = {
  fontFamily: "var(--font-labels-stack)",
  fontSize: "11px",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--ink-muted)",
  fontWeight: 500,
  paddingBottom: "4px",
  borderBottom: "1px solid var(--rule-light)",
};

/** Small-caps section rubric (shared with Galignani OCR headings). */
export function ProseRubric({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return <h4 style={{ ...RUBRIC_BASE, margin: "0 0 0.4em", ...style }}>{children}</h4>;
}

/**
 * Detect a paragraph that is entirely a bold rubric label, e.g.:
 *   **CHAMBRE DES PAIRS.**   **PARIS, le 1er septembre.**
 * Returns the inner text (with any period that was inside the bold span),
 * or null if this is regular prose.
 */
function parseRubricText(para: string): string | null {
  // Whole paragraph is one bold span, optional trailing punctuation outside.
  const m = /^\*\*([^*\n]+)\*\*[.!?,;]?$/.exec(para.trim());
  return m ? m[1] : null;
}

/** Split on blank lines and render each paragraph with the chosen inline renderer. */
export function renderProseParagraphs(
  text: string,
  renderInline: ProseInlineRenderer,
): ReactNode {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return paragraphs.map((p, j) => {
    const rubric = parseRubricText(p);
    if (rubric !== null) {
      return (
        <ProseRubric
          key={j}
          style={{
            margin: j === 0 ? "0 0 0.4em" : "1.5em 0 0.4em",
          }}
        >
          {rubric}
        </ProseRubric>
      );
    }
    return <p key={j}>{renderInline(p)}</p>;
  });
}
