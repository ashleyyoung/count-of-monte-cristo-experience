"use client";

import styled from "styled-components";
import Link from "next/link";

export interface ContributorInfo {
  id: string;
  name: string;
  slug: string;
  role: string | null;
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

const BylineLink = styled(Link)`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-tertiary);
  text-decoration: underline;
  text-underline-offset: 2px;
  letter-spacing: 0.04em;

  &:hover {
    color: var(--oxblood);
  }
`;

export default function ContributorByline({ contributor, prefix = "By" }: Props) {
  return (
    <Byline>
      <span>{prefix}</span>
      <BylineLink href={`/people/${contributor.slug}`}>
        {contributor.name}
      </BylineLink>
      {contributor.role && (
        <span>· {contributor.role}</span>
      )}
    </Byline>
  );
}
