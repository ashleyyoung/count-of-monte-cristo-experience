"use client";

/**
 * components/ui/Cite.tsx
 *
 * In-text superscript citation marker with a torn-margin hover card.
 * Used everywhere an attribution is needed; the single citation primitive for the project.
 *
 * Design rules:
 * - We cite the works of others, not our own translation engine. For machine
 *   translations the card shows the original author/work + a link to the French
 *   original. The translation model is never named or displayed.
 * - Renders cleanly when translation-provenance fields are absent (the component
 *   ships before any translations exist).
 * - Keyboard-accessible, Esc closes, prefers-reduced-motion respected.
 */

import React, { useId } from "react";
import styled, { keyframes, css } from "styled-components";
import { useHoverCard } from "./useHoverCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CiteSource {
  /** Title of the original work being cited */
  title: string;
  /** Original author / work attribution */
  attribution: string;
  /** e.g. "Public Domain", "CC BY-SA 4.0" */
  license?: string;
  /** PUBLIC link to the source text (Gallica, FMC Project, etc.) */
  source_text_url?: string;
  /** Link label for source_text_url; defaults to "View the original (in French)". */
  source_text_link_label?: string;
  /** Generic reference link (Wikipedia, journal article, archive) — shown as "View source" */
  reference_url?: string;
  /** Human translator credit — shown only for existing_published translations */
  translator?: string;
  /** "Further reading" outbound link for copyrighted translations that can't be embedded */
  translation_source_url?: string;
}

interface CiteProps {
  source: CiteSource;
  /** Displayed numeral. Caller is responsible for per-context numbering. */
  n: number;
  /** If true, marker is placed inline before any trailing space; default true */
  inline?: boolean;
}

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const Marker = styled.button`
  display: inline-block;
  vertical-align: super;
  font-family: var(--font-labels-stack);
  font-style: normal;
  font-weight: 700;
  font-size: 0.62em;
  line-height: 1;
  color: var(--oxblood);
  background: rgba(201, 162, 75, 0.18);
  border: 1px solid rgba(155, 36, 30, 0.35);
  border-radius: 3px;
  padding: 0.12em 0.32em;
  margin: 0 1px 0 2px;
  cursor: pointer;
  transition: color 0.1s, background 0.1s, border-color 0.1s;
  position: relative;
  top: -0.15em;

  &:hover,
  &:focus-visible {
    color: var(--paper-base);
    background: var(--oxblood);
    border-color: var(--oxblood);
    outline: none;
  }
`;

const CardWrap = styled.span`
  position: relative;
  display: inline;
`;

const Card = styled.div<{ $reducedMotion: boolean }>`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;

  background: var(--paper-card);
  border: 1px solid var(--rule-mid);
  /* Torn-margin effect via border-radius variation */
  border-radius: 1px 3px 2px 1px / 2px 1px 3px 1px;
  box-shadow:
    0 2px 12px rgba(29, 20, 10, 0.14),
    inset 0 0 0 1px rgba(185, 165, 120, 0.25);

  padding: 0.65rem 0.85rem 0.6rem;
  min-width: 200px;
  max-width: min(280px, calc(100vw - 32px));
  width: max-content;

  ${({ $reducedMotion }) =>
    !$reducedMotion &&
    css`
      animation: ${fadeIn} 0.14s ease-out both;
    `}
`;

const CardTitle = styled.p`
  margin: 0 0 0.2rem;
  font-family: var(--font-tooltip-title-stack);
  font-size: 0.95rem;
  line-height: 1.35;
  color: var(--ink-primary);
`;

const CardMeta = styled.p`
  margin: 0 0 0.15rem;
  font-family: var(--font-tooltip-body-stack);
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--ink-secondary);
`;

const CardLink = styled.a`
  display: inline-block;
  margin-top: 0.3rem;
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

const CardLinkRow = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-top: 0.25rem;
`;

const LicenseBadge = styled.span`
  font-family: var(--font-caption-stack);
  font-size: 0.6rem;
  color: var(--ink-muted);
  margin-top: 0.1rem;
  display: block;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Cite({ source, n, inline = true }: CiteProps) {
  const { open, reducedMotion, wrapRef, openNow, closeSoon, handleBlur } =
    useHoverCard();
  const id = useId();
  const cardId = `cite-card-${id}`;

  const numeral = n;

  return (
    <CardWrap
      ref={wrapRef}
      style={{ display: inline ? "inline" : "block" }}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <Marker
        type="button"
        aria-label={`Citation ${n}: ${source.title}`}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onFocus={openNow}
        onBlur={handleBlur}
        onClick={openNow}
      >
        {numeral}
      </Marker>

      {open && (
        <Card $reducedMotion={reducedMotion} id={cardId} role="note">
          <CardTitle>{source.title}</CardTitle>
          {source.attribution && <CardMeta>{source.attribution}</CardMeta>}
          {source.translator && (
            <CardMeta>Trans. {source.translator}</CardMeta>
          )}
          {source.license && (
            <LicenseBadge>{source.license}</LicenseBadge>
          )}
          {(source.source_text_url || source.reference_url || source.translation_source_url) && (
            <CardLinkRow>
              {source.source_text_url && (
                <CardLink
                  href={source.source_text_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {source.source_text_link_label ?? "View the original (in French)"} ↗
                </CardLink>
              )}
              {source.reference_url && (
                <CardLink
                  href={source.reference_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View source ↗
                </CardLink>
              )}
              {source.translation_source_url && (
                <CardLink
                  href={source.translation_source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Further reading ↗
                </CardLink>
              )}
            </CardLinkRow>
          )}
        </Card>
      )}
    </CardWrap>
  );
}
