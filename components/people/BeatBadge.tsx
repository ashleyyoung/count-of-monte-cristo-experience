"use client";

import styled from "styled-components";
import { getBeatLabel } from "@/lib/beat-display";

const Badge = styled.span`
  background: var(--gilt-warm);
  color: var(--paper-base);
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  border-radius: 2px;
  font-family: var(--font-labels-stack);
  letter-spacing: 0.04em;
  white-space: nowrap;
`;

interface BeatBadgeProps {
  beat: string | null | undefined;
  className?: string;
}

export default function BeatBadge({ beat, className }: BeatBadgeProps) {
  const label = getBeatLabel(beat);
  if (!label) return null;

  return (
    <Badge className={className} aria-label={label}>
      ✦ {label}
    </Badge>
  );
}
