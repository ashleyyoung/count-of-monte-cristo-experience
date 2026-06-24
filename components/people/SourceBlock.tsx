"use client";

/**
 * components/people/SourceBlock.tsx
 *
 * Renders a sources jsonb array as visible, clickable attribution links.
 * Used on every profile/excerpt/asset per the always-source rule.
 */

import styled from "styled-components";

interface Source {
  url?: string;
  label?: string;
  title?: string;
  author?: string;
  year?: number | string;
}

interface SourceBlockProps {
  sources: unknown[];
  label?: string;
}

const Block = styled.aside`
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--rule-light);
`;

const BlockLabel = styled.p`
  margin: 0 0 0.3rem;
  font-family: var(--font-labels-stack);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ink-muted);
`;

const SourceList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 0.75rem;
`;

const SourceItem = styled.li`
  font-size: 0.72rem;
  font-family: var(--font-caption-stack);
  color: var(--ink-muted);
`;

const SourceAnchor = styled.a`
  color: var(--gilt-deep);
  text-decoration: none;
  border-bottom: 1px dotted var(--gilt-deep);

  &:hover { color: var(--oxblood); }
`;

function normalizeSource(s: unknown): Source {
  if (typeof s === "string") return { url: s, label: s };
  return (s as Source) ?? {};
}

function sourceLabel(s: Source): string {
  return s.label ?? s.title ?? (s.author ? `${s.author}${s.year ? `, ${s.year}` : ""}` : s.url ?? "Source");
}

export default function SourceBlock({ sources, label = "Sources" }: SourceBlockProps) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const normalized = sources.map(normalizeSource).filter((s) => s.url || s.label || s.title);
  if (normalized.length === 0) return null;

  return (
    <Block aria-label={label}>
      <BlockLabel>{label}</BlockLabel>
      <SourceList>
        {normalized.map((s, i) => (
          <SourceItem key={i}>
            {s.url ? (
              <SourceAnchor href={s.url} target="_blank" rel="noopener noreferrer">
                {sourceLabel(s)} ↗
              </SourceAnchor>
            ) : (
              sourceLabel(s)
            )}
          </SourceItem>
        ))}
      </SourceList>
    </Block>
  );
}
