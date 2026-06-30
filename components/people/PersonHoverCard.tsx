"use client";

/**
 * components/people/PersonHoverCard.tsx
 *
 * Inline person reference: a linked name that reveals a small hover card with a
 * portrait-less summary (beat, life years, one-line tagline) and a link to the
 * full profile. Used on bylines today; reusable for named figures in prose.
 *
 * Interaction comes from the shared useHoverCard hook (pointer hover with a
 * grace timer, keyboard focus, tap-to-open on touch, Esc / outside-click close)
 * — the same model behind <Cite>.
 */

import React, { useId } from "react";
import Link from "next/link";
import styled, { keyframes, css } from "styled-components";
import { useHoverCard } from "@/components/ui/useHoverCard";
import { getBeatLabel } from "@/lib/beat-display";
import BeatBadge from "./BeatBadge";

export interface PersonHoverCardPerson {
  name: string;
  slug: string;
  beat?: string | null;
  birth?: number | null;
  death?: number | null;
  tagline?: string | null;
}

interface Props {
  person: PersonHoverCardPerson;
  /** Trigger content; defaults to the person's name. */
  children?: React.ReactNode;
}

/** "1803–1869" / "b. 1803" / "d. 1869" / null when neither year is known. */
function lifeYears(birth?: number | null, death?: number | null): string | null {
  if (birth && death) return `${birth}–${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return null;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

const Wrap = styled.span`
  position: relative;
  display: inline;
`;

const TriggerLink = styled(Link)`
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: var(--rule-mid);
  cursor: pointer;
  transition: color 0.12s, text-decoration-color 0.12s;

  &:hover,
  &:focus-visible {
    color: var(--oxblood);
    text-decoration-color: var(--oxblood);
    outline: none;
  }
`;

const Card = styled.div<{ $reducedMotion: boolean }>`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;

  background: var(--paper-card);
  border: 1px solid var(--rule-mid);
  border-radius: 1px 3px 2px 1px / 2px 1px 3px 1px;
  box-shadow:
    0 2px 12px rgba(29, 20, 10, 0.14),
    inset 0 0 0 1px rgba(185, 165, 120, 0.25);

  padding: 0.65rem 0.85rem 0.6rem;
  min-width: 200px;
  max-width: min(280px, calc(100vw - 32px));
  width: max-content;
  text-align: left;

  ${({ $reducedMotion }) =>
    !$reducedMotion &&
    css`
      animation: ${fadeIn} 0.14s ease-out both;
    `}
`;

const CardName = styled.p`
  margin: 0 0 0.3rem;
  font-family: var(--font-tooltip-title-stack);
  font-size: 0.95rem;
  line-height: 1.3;
  color: var(--ink-primary);
`;

const CardMetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.3rem;
`;

const CardYears = styled.span`
  font-family: var(--font-caption-stack);
  font-size: 0.7rem;
  color: var(--ink-muted);
`;

const CardBlurb = styled.p`
  margin: 0;
  font-family: var(--font-tooltip-body-stack);
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--ink-secondary);
`;

const CardLink = styled(Link)`
  display: inline-block;
  margin-top: 0.35rem;
  font-family: var(--font-labels-stack);
  font-size: 0.64rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gilt-deep);
  text-decoration: none;
  border-bottom: 1px dotted var(--gilt-deep);

  &:hover {
    color: var(--oxblood);
    border-bottom-color: var(--oxblood);
  }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PersonHoverCard({ person, children }: Props) {
  const { open, reducedMotion, wrapRef, openNow, closeSoon, handleBlur } =
    useHoverCard();
  const id = useId();
  const cardId = `person-card-${id}`;

  const href = `/people/${person.slug}`;
  const years = lifeYears(person.birth, person.death);
  const beatLabel = getBeatLabel(person.beat);
  // Tagline is the editorial blurb; when absent the beat + years line already
  // carries the summary, so we don't repeat it as a blurb.
  const blurb = person.tagline ?? null;

  return (
    <Wrap
      ref={wrapRef}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <TriggerLink
        href={href}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onFocus={openNow}
        onBlur={handleBlur}
      >
        {children ?? person.name}
      </TriggerLink>

      {open && (
        <Card $reducedMotion={reducedMotion} id={cardId} role="note">
          <CardName>{person.name}</CardName>
          {(beatLabel || years) && (
            <CardMetaRow>
              {person.beat && <BeatBadge beat={person.beat} />}
              {years && <CardYears>{years}</CardYears>}
            </CardMetaRow>
          )}
          {blurb && <CardBlurb>{blurb}</CardBlurb>}
          <CardLink href={href}>View profile →</CardLink>
        </Card>
      )}
    </Wrap>
  );
}
