"use client";

import styled from "styled-components";
import { MISSING_ISSUE_NOTE } from "@/lib/missing-issues";

const Callout = styled.div`
  border: 1px solid var(--rule-mid);
  border-left: 3px solid var(--oxblood);
  background: var(--paper-feature);
  padding: 16px 18px;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Heading = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--oxblood);
  margin: 0;
`;

const Body = styled.p`
  font-family: var(--font-body-stack);
  font-size: 15px;
  line-height: 1.6;
  color: var(--ink-secondary);
  margin: 0;
`;

/**
 * Callout shown on the Débats-derived tabs (Débats, Art, Science, Original
 * paper, Translated paper) for the one serialization date whose issue Gallica
 * never digitised. See lib/missing-issues.ts.
 */
export default function MissingIssueNote() {
  return (
    <Callout role="note">
      <Heading>The one gap in the archive</Heading>
      <Body>{MISSING_ISSUE_NOTE}</Body>
    </Callout>
  );
}
