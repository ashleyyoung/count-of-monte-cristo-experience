"use client";

import styled from "styled-components";
import type { ResolvedDocItem } from "@/lib/content";

interface Props {
  debatsItems: ResolvedDocItem[];
  galignaniItems: ResolvedDocItem[];
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
  }
`;

const Col = styled.div<{ $source: "debats" | "galignani" }>`
  background: ${({ $source }) =>
    $source === "debats" ? "var(--paper-feature)" : "var(--paper-deep)"};
  border: 1px solid var(--rule-light);
  padding: 10px;
`;

const ColLabel = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 9px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 6px;
`;

const ColText = styled.p`
  font-family: var(--font-body-stack);
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-secondary);
  margin: 0;
`;

const EmptyHint = styled.p`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--rule-mid);
  margin: 0;
`;

function firstText(items: ResolvedDocItem[]): string | null {
  const t = items.find((i) => i.kind === "text");
  if (!t || t.kind !== "text") return null;
  // Take first 200 chars
  return t.text.slice(0, 200).trim() + (t.text.length > 200 ? "…" : "");
}

export default function PoliticsCompare({ debatsItems, galignaniItems }: Props) {
  const debatsText = firstText(debatsItems);
  const galignaniText = firstText(galignaniItems);

  return (
    <Grid>
      <Col $source="debats">
        <ColLabel>Débats</ColLabel>
        {debatsText
          ? <ColText>{debatsText}</ColText>
          : <EmptyHint>No political coverage</EmptyHint>
        }
      </Col>
      <Col $source="galignani">
        <ColLabel>Galignani</ColLabel>
        {galignaniText
          ? <ColText>{galignaniText}</ColText>
          : <EmptyHint>No coverage</EmptyHint>
        }
      </Col>
    </Grid>
  );
}
