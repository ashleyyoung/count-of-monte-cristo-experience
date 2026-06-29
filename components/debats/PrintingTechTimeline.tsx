"use client";

/**
 * components/debats/PrintingTechTimeline.tsx
 *
 * Interactive timeline of the printing innovations that led up to the
 * technology that printed the Journal des Débats. Each point is a hoverable,
 * keyboard-focusable marker; the tooltip card shows the invention, the
 * inventor, the year, a one-line description, and a source link.
 *
 * Reuses the hover behavior (useHoverCard) and the card styling conventions
 * of components/ui/Cite.tsx. Points are evenly spaced for legibility while the
 * year labels make the four-century gap then the 1800s acceleration visible.
 */

import React from "react";
import styled, { keyframes, css } from "styled-components";
import { motion, useReducedMotion } from "framer-motion";
import { useHoverCard } from "@/components/ui/useHoverCard";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface TechEvent {
  yearLabel: string;
  invention: string;
  inventor: string;
  place: string;
  blurb: string;
  source: { label: string; url: string };
  /** The press generation that actually printed the Débats. */
  enabling?: boolean;
}

const EVENTS: TechEvent[] = [
  {
    yearLabel: "c. 1440",
    invention: "Movable metal type",
    inventor: "Johannes Gutenberg",
    place: "Mainz",
    blurb:
      "Cast-metal sorts and the screw press make the printed book reproducible, the foundation every later innovation builds on.",
    source: {
      label: "Wikipedia, Printing press",
      url: "https://en.wikipedia.org/wiki/Printing_press",
    },
  },
  {
    yearLabel: "1798",
    invention: "Continuous paper machine",
    inventor: "Nicolas-Louis Robert",
    place: "France",
    blurb:
      "The first machine to make paper in a continuous web, mechanizing the supply that fast presses would soon devour.",
    source: {
      label: "Wikipedia, Nicholas Louis Robert",
      url: "https://en.wikipedia.org/wiki/Nicholas_Louis_Robert",
    },
  },
  {
    yearLabel: "1800",
    invention: "The Stanhope press",
    inventor: "Charles, 3rd Earl Stanhope",
    place: "England",
    blurb:
      "The first all-iron hand press, stronger and faster to work than the wooden presses it replaced.",
    source: {
      label: "Wikipedia, Stanhope press",
      url: "https://en.wikipedia.org/wiki/Stanhope_press",
    },
  },
  {
    yearLabel: "c. 1800",
    invention: "Improved stereotyping",
    inventor: "Louis-Etienne Herhan, with the Didot firm",
    place: "France",
    blurb:
      "Casting a solid plate (the cliché) from a finished forme let a page be preserved and rerun without resetting the type.",
    source: {
      label: "Revue d'histoire moderne et contemporaine (Cairn)",
      url: "https://shs.cairn.info/journal-revue-d-histoire-moderne-et-contemporaine-2007-1-page-193?lang=en",
    },
  },
  {
    yearLabel: "1810",
    invention: "Steam-powered press patent",
    inventor: "Friedrich Koenig, with Andreas Friedrich Bauer",
    place: "London",
    blurb:
      "Koenig patents a press driven by a steam engine, joining mechanical power to the printing process for the first time.",
    source: {
      label: "Britannica, Koenig's mechanical press",
      url: "https://www.britannica.com/topic/printing-publishing/Koenigs-mechanical-press-early-19th-century",
    },
  },
  {
    yearLabel: "1814",
    invention: "Steam cylinder press",
    inventor: "Friedrich Koenig and Andreas Bauer",
    place: "The Times of London",
    blurb:
      "The first newspaper printed by steam cylinder, reaching about 1,100 sheets an hour, far beyond any hand press.",
    source: {
      label: "Wikipedia, Printing press",
      url: "https://en.wikipedia.org/wiki/Printing_press",
    },
  },
  {
    yearLabel: "c. 1825",
    invention: "Napier cylinder machines",
    inventor: "Adopted by the Journal des Débats",
    place: "Paris",
    blurb:
      "The Débats was an early adopter of cylinder printing, the press generation that carried the paper through the Monte Cristo years.",
    source: {
      label: "History of Information (citing Moran, Printing Presses)",
      url: "https://www.historyofinformation.com/detail.php?id=4419",
    },
    enabling: true,
  },
  {
    yearLabel: "1843",
    invention: "Type-revolving rotary press",
    inventor: "Richard M. Hoe",
    place: "United States",
    blurb:
      "Hoe's rotary press approached 8,000 impressions an hour and reached Paris with La Patrie in 1846, pointing to the mass press to come.",
    source: {
      label: "Britannica, Koenig's mechanical press",
      url: "https://www.britannica.com/topic/printing-publishing/Koenigs-mechanical-press-early-19th-century",
    },
  },
];

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Wrap = styled.div`
  margin: 1rem 0 2.5rem;
`;

const Track = styled.div`
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding-top: 14px;

  @media (max-width: 700px) {
    display: none;
  }
`;

const AxisLine = styled.div`
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(201, 162, 75, 0.6) 6%,
    rgba(201, 162, 75, 0.6) 94%,
    transparent
  );
`;

const Point = styled(motion.div)`
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const Dot = styled.button<{ $enabling: boolean }>`
  position: relative;
  z-index: 2;
  width: ${({ $enabling }) => ($enabling ? "16px" : "12px")};
  height: ${({ $enabling }) => ($enabling ? "16px" : "12px")};
  border-radius: 50%;
  border: 2px solid var(--gilt-deep);
  background: ${({ $enabling }) =>
    $enabling ? "var(--gilt-warm)" : "var(--paper-card)"};
  cursor: pointer;
  padding: 0;
  transition: transform 0.12s, background 0.12s, box-shadow 0.12s;

  &:hover,
  &:focus-visible {
    transform: scale(1.25);
    background: var(--gilt-warm);
    box-shadow: 0 0 0 4px rgba(201, 162, 75, 0.18);
    outline: none;
  }
`;

const YearLabel = styled.span`
  margin-top: 0.5rem;
  font-family: var(--font-labels-stack);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  color: var(--ink-secondary);
  white-space: nowrap;
`;

const NameLabel = styled.span`
  margin-top: 0.15rem;
  font-family: var(--font-caption-stack);
  font-size: 0.68rem;
  line-height: 1.25;
  color: var(--ink-muted);
  text-align: center;
`;

const Card = styled.div<{ $reducedMotion: boolean; $align: "left" | "center" | "right" }>`
  position: absolute;
  bottom: calc(100% + 8px);
  z-index: 200;

  ${({ $align }) =>
    $align === "left"
      ? css`
          left: 0;
        `
      : $align === "right"
        ? css`
            right: 0;
          `
        : css`
            left: 50%;
            transform: translateX(-50%);
          `}

  background: var(--paper-card);
  border: 1px solid var(--rule-mid);
  border-radius: 1px 3px 2px 1px / 2px 1px 3px 1px;
  box-shadow:
    0 2px 12px rgba(29, 20, 10, 0.14),
    inset 0 0 0 1px rgba(185, 165, 120, 0.25);

  padding: 0.65rem 0.85rem 0.6rem;
  min-width: 220px;
  max-width: 280px;
  width: max-content;
  text-align: left;

  ${({ $reducedMotion }) =>
    !$reducedMotion &&
    css`
      animation: ${fadeIn} 0.14s ease-out both;
    `}
`;

const CardYear = styled.p`
  margin: 0 0 0.15rem;
  font-family: var(--font-labels-stack);
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--gilt-deep);
`;

const CardTitle = styled.p`
  margin: 0 0 0.2rem;
  font-family: var(--font-tooltip-title-stack);
  font-size: 0.95rem;
  line-height: 1.35;
  color: var(--ink-primary);
`;

const CardInventor = styled.p`
  margin: 0 0 0.35rem;
  font-family: var(--font-tooltip-body-stack);
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--ink-secondary);
`;

const CardBlurb = styled.p`
  margin: 0 0 0.4rem;
  font-family: var(--font-body-stack);
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--ink-primary);
`;

const CardLink = styled.a`
  display: inline-block;
  font-family: var(--font-labels-stack);
  font-size: 0.62rem;
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

// Mobile stacked list ------------------------------------------------------

const MobileList = styled.ol`
  display: none;
  list-style: none;
  margin: 0;
  padding: 0 0 0 1.1rem;
  border-left: 2px solid var(--rule-light);

  @media (max-width: 700px) {
    display: block;
  }
`;

const MobileItem = styled.li`
  position: relative;
  padding: 0 0 1.1rem 0.4rem;

  &::before {
    content: "";
    position: absolute;
    left: calc(-1.1rem - 5px);
    top: 4px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--gilt-deep);
    background: var(--paper-card);
  }
`;

const MobileYear = styled.span`
  display: block;
  font-family: var(--font-labels-stack);
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--gilt-deep);
`;

const MobileTitle = styled.span`
  display: block;
  font-family: var(--font-display-stack);
  font-size: 0.95rem;
  color: var(--ink-primary);
`;

const MobileInventor = styled.span`
  display: block;
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 0.82rem;
  color: var(--ink-secondary);
  margin-bottom: 0.2rem;
`;

const MobileBlurb = styled.span`
  display: block;
  font-family: var(--font-body-stack);
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--ink-primary);
`;

// ---------------------------------------------------------------------------
// Point with its own hover card
// ---------------------------------------------------------------------------

function TimelinePoint({
  event,
  index,
  total,
  animate,
}: {
  event: TechEvent;
  index: number;
  total: number;
  animate: boolean;
}) {
  const { open, reducedMotion, wrapRef, openNow, closeSoon, handleBlur } =
    useHoverCard();
  const cardId = `tech-card-${index}`;

  const align: "left" | "center" | "right" =
    index === 0 ? "left" : index === total - 1 ? "right" : "center";

  return (
    <Point
      ref={wrapRef as React.Ref<HTMLDivElement>}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
      initial={animate ? { opacity: 0, y: 6 } : false}
      whileInView={animate ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Dot
        type="button"
        $enabling={!!event.enabling}
        aria-label={`${event.yearLabel}: ${event.invention}, ${event.inventor}`}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onFocus={openNow}
        onBlur={handleBlur}
        onClick={openNow}
      />
      <YearLabel>{event.yearLabel}</YearLabel>
      <NameLabel>{event.invention}</NameLabel>

      {open && (
        <Card
          id={cardId}
          role="tooltip"
          $reducedMotion={reducedMotion}
          $align={align}
        >
          <CardYear>{event.yearLabel}</CardYear>
          <CardTitle>{event.invention}</CardTitle>
          <CardInventor>
            {event.inventor} · {event.place}
          </CardInventor>
          <CardBlurb>{event.blurb}</CardBlurb>
          <CardLink
            href={event.source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {event.source.label} ↗
          </CardLink>
        </Card>
      )}
    </Point>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PrintingTechTimeline() {
  const prefersReduced = useReducedMotion();
  const animate = !prefersReduced;

  return (
    <Wrap>
      <Track>
        <AxisLine />
        {EVENTS.map((event, i) => (
          <TimelinePoint
            key={`${event.yearLabel}-${event.invention}`}
            event={event}
            index={i}
            total={EVENTS.length}
            animate={animate}
          />
        ))}
      </Track>

      <MobileList>
        {EVENTS.map((event) => (
          <MobileItem key={`${event.yearLabel}-${event.invention}`}>
            <MobileYear>{event.yearLabel}</MobileYear>
            <MobileTitle>{event.invention}</MobileTitle>
            <MobileInventor>
              {event.inventor} · {event.place}
            </MobileInventor>
            <MobileBlurb>{event.blurb}</MobileBlurb>
          </MobileItem>
        ))}
      </MobileList>
    </Wrap>
  );
}
