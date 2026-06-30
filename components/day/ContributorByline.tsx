"use client";

import styled from "styled-components";
import PersonHoverCard from "@/components/people/PersonHoverCard";

export interface ContributorInfo {
  id: string;
  name: string;
  slug: string;
  /** Display role for the byline suffix (derived from beat). */
  role: string | null;
  /** Beat enum (music, drama, …) for the hover card's badge. */
  beat: string | null;
  birth: number | null;
  death: number | null;
  /** One-line editorial blurb for the hover card; null falls back to beat + years. */
  tagline: string | null;
}

interface Props {
  contributor: ContributorInfo;
  prefix?: string;
}

const Byline = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
  letter-spacing: 0.04em;
`;

const BylineName = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-tertiary);
  letter-spacing: 0.04em;
`;

export default function ContributorByline({ contributor, prefix = "By" }: Props) {
  return (
    <Byline>
      <span>{prefix}</span>
      <PersonHoverCard person={contributor}>
        <BylineName>{contributor.name}</BylineName>
      </PersonHoverCard>
      {contributor.role && (
        <span>· {contributor.role}</span>
      )}
    </Byline>
  );
}
