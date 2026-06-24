/**
 * Per-source inline prose renderers for day-content text items.
 *
 * Branch on translation_origin at the call site (TabPrimitives, TranslationHistory).
 * - machine_claude: Markdown per the translation system prompt (**bold**, *italic*, [gloss])
 * - existing_published / staff / undefined: Gutenberg-style _underscore_ and *italic* only
 */

import type { ReactNode } from "react";

const PUBLIC_DOMAIN_INLINE =
  /(_[^_\n]+_|(?<!\*)\*[^*\n]+\*(?!\*))/g;

/** Bold spans may contain single-asterisk italics inside, e.g. **FEUILLETON of the *Journal des Débats*** */
const CLAUDE_BOLD = /\*\*(.+?)\*\*(?=[^*]|$)/g;

const CLAUDE_INNER = /(\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\])/g;

/** Gutenberg / hberlioz / staff: _underscore_ and *italic* only; ** stays literal. */
export function renderPublicDomainInline(text: string): ReactNode {
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
    return part;
  });
}

function renderClaudeInner(text: string, keyPrefix = ""): ReactNode {
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
    return part;
  });
}

/** Claude machine translations: full inline Markdown from the translation prompt. */
export function renderClaudeTranslationInline(text: string): ReactNode {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  const boldRe = new RegExp(CLAUDE_BOLD.source, "g");
  let match: RegExpExecArray | null;

  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        renderClaudeInner(text.slice(lastIndex, match.index), `${lastIndex}-`),
      );
    }
    nodes.push(
      <strong key={match.index}>
        {renderClaudeInner(match[1], `${match.index}-`)}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(renderClaudeInner(text.slice(lastIndex), `${lastIndex}-`));
  }

  if (nodes.length === 0) {
    return renderClaudeInner(text);
  }
  if (nodes.length === 1) {
    return nodes[0];
  }
  return nodes;
}

export type ProseInlineRenderer = (text: string) => ReactNode;

export function pickProseRenderer(
  translationOrigin: string | undefined,
): ProseInlineRenderer {
  return translationOrigin === "machine_claude"
    ? renderClaudeTranslationInline
    : renderPublicDomainInline;
}

/** Split on blank lines and render each paragraph with the chosen inline renderer. */
export function renderProseParagraphs(
  text: string,
  renderInline: ProseInlineRenderer,
): ReactNode {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return paragraphs.map((p, j) => <p key={j}>{renderInline(p)}</p>);
}
