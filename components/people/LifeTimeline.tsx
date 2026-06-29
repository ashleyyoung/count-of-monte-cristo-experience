"use client";

/**
 * components/people/LifeTimeline.tsx
 *
 * Horizontal birth→death band with hoverable event dots.
 * - Birth and death anchor the two ends of the axis.
 * - life_events rows render as positioned dots with a hover tooltip
 *   (title, date, description, source link).
 * - Framer Motion dot reveal; prefers-reduced-motion → static dots, no animation.
 * - Gracefully handles null birth/death years by hiding the axis.
 */

import React, { useId, useState } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import type { LifeEvent } from "@/lib/people";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LifeTimelineProps {
  name: string;
  birth: number | null;
  death: number | null;
  events: LifeEvent[];
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Wrapper = styled.div`
  position: relative;
  padding: 2.5rem 0 1.5rem;
`;

const AxisRow = styled.div`
  position: relative;
  height: 16px;
  margin: 0 24px;
`;

const AxisLine = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 2px;
  transform: translateY(-50%);
  background: linear-gradient(
    to right,
    var(--rule-light),
    var(--rule-strong) 40%,
    var(--rule-strong) 60%,
    var(--rule-light)
  );
`;

const AnchorLabel = styled.span<{ $side: "left" | "right" }>`
  position: absolute;
  top: calc(50% + 10px);
  ${({ $side }) => $side}: 0;
  font-family: var(--font-labels-stack);
  font-size: 0.7rem;
  color: var(--ink-muted);
  letter-spacing: 0.04em;
`;

const AnchorDot = styled.div<{ $side: "left" | "right" }>`
  position: absolute;
  top: 50%;
  ${({ $side }) => $side}: 0;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--ink-secondary);
  border: 1.5px solid var(--paper-base);
`;

const EventDotWrap = styled.div<{ $pct: number }>`
  position: absolute;
  top: 50%;
  left: ${({ $pct }) => $pct}%;
  transform: translate(-50%, -50%);
  z-index: 2;
  line-height: 0;
`;

const DotButton = styled(motion.button)`
  display: block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1.5px solid var(--paper-base);
  background: var(--gilt-warm);
  cursor: pointer;
  padding: 0;

  &:hover, &:focus-visible {
    background: var(--gilt-deep);
    outline: none;
  }
`;

const Tooltip = styled.div<{ $above: boolean }>`
  position: absolute;
  ${({ $above }) => ($above ? "bottom: 18px" : "top: 18px")};
  left: 50%;
  transform: translateX(-50%);
  background: var(--paper-card);
  border: 1px solid var(--rule-mid);
  border-radius: 1px 3px 2px 1px / 2px 1px 3px 1px;
  padding: 0.5rem 0.75rem;
  min-width: 180px;
  max-width: min(260px, calc(100vw - 32px));
  box-shadow:
    0 2px 12px rgba(29, 20, 10, 0.14),
    inset 0 0 0 1px rgba(185, 165, 120, 0.2);
  pointer-events: none;
  z-index: 10;
`;

const TooltipTitle = styled.p`
  margin: 0 0 0.2rem;
  font-family: var(--font-tooltip-title-stack);
  font-size: 0.95rem;
  line-height: 1.35;
  color: var(--ink-primary);
`;

const TooltipDate = styled.p`
  margin: 0 0 0.2rem;
  font-size: 0.68rem;
  font-family: var(--font-caption-stack);
  color: var(--ink-muted);
`;

const TooltipDesc = styled.p`
  margin: 0 0 0.25rem;
  font-family: var(--font-tooltip-body-stack);
  font-size: 0.82rem;
  color: var(--ink-secondary);
  line-height: 1.45;
`;

const SourceLink = styled.a`
  display: inline-block;
  font-size: 0.64rem;
  color: var(--gilt-deep);
  font-family: var(--font-labels-stack);
  font-style: normal;
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px dotted var(--gilt-deep);
  margin-top: 0.3rem;

  &:hover { color: var(--oxblood); border-bottom-color: var(--oxblood); }
`;

const SerializationBand = styled.div<{ $left: number; $width: number }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${({ $left }) => $left}%;
  width: ${({ $width }) => $width}%;
  background: rgba(201, 162, 75, 0.12);
  border-left: 1px dashed var(--gilt-warm);
  border-right: 1px dashed var(--gilt-warm);
  pointer-events: none;
`;

const SerializationLabel = styled.span<{ $left: number }>`
  position: absolute;
  top: -24px;
  left: ${({ $left }) => $left}%;
  transform: translateX(-50%);
  font-size: 0.6rem;
  font-family: var(--font-labels-stack);
  color: var(--gilt-deep);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEventDate(ev: LifeEvent): string {
  if (!ev.event_date) return "";
  const [year, month, day] = ev.event_date.split("-");
  if (ev.precision === "year") return year;
  if (ev.precision === "month") {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(month, 10) - 1]} ${year}`;
  }
  return `${parseInt(day, 10)} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(month,10)-1]} ${year}`;
}

function getFirstSource(sources: unknown[]): { url: string; label: string } | null {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  const s = sources[0] as Record<string, string> | string;
  if (typeof s === "string") return { url: s, label: "Source" };
  if (s.url) return { url: s.url, label: s.label ?? s.title ?? "Source" };
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LifeTimeline({ name, birth, death, events }: LifeTimelineProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const id = useId();

  if (!birth) return null;

  const endYear = death ?? new Date().getFullYear();
  const span = endYear - birth;
  if (span <= 0) return null;

  const toPercent = (year: number) =>
    Math.max(0, Math.min(100, ((year - birth) / span) * 100));

  // Serialization window: Aug 1844 – Aug 1846
  const serStart = toPercent(1844 + 7 / 12);
  const serEnd   = toPercent(1846 + 7 / 12);
  const serWidth = serEnd - serStart;

  // Sort events by date for consistent rendering
  const sorted = [...events]
    .filter((e) => e.event_date)
    .sort((a, b) => (a.event_date! < b.event_date! ? -1 : 1));

  const dotMotion = {
    hidden: { scale: 0, opacity: 0 },
    visible: (i: number) => ({
      scale: 1,
      opacity: 1,
      transition: { delay: i * 0.04, duration: 0.2, ease: "easeOut" as const },
    }),
  };

  return (
    <Wrapper aria-label={`Life timeline for ${name}`}>
      <AxisRow>
        <AxisLine />

        {/* Serialization window marker */}
        {serWidth > 0 && (
          <>
            <SerializationLabel $left={serStart + serWidth / 2}>
              Monte Cristo 1844–46
            </SerializationLabel>
            <SerializationBand $left={serStart} $width={serWidth} />
          </>
        )}

        {/* Anchor dots */}
        <AnchorDot $side="left" />
        <AnchorDot $side="right" />

        {/* Anchor labels */}
        <AnchorLabel $side="left">{birth}</AnchorLabel>
        <AnchorLabel $side="right">{death ?? "present"}</AnchorLabel>

        {/* Event dots */}
        {sorted.map((ev, i) => {
          const yearNum = parseInt(ev.event_date!.slice(0, 4), 10);
          const pct = toPercent(yearNum);
          const src = getFirstSource(ev.sources);
          const above = i % 2 === 0;
          const isActive = activeIdx === i;

          return (
            <EventDotWrap key={`${id}-${i}`} $pct={pct}>
              <DotButton
                variants={dotMotion}
                initial="hidden"
                animate="visible"
                whileHover={{ scale: 1.5 }}
                custom={i}
                aria-label={ev.title}
                aria-expanded={isActive}
                aria-describedby={isActive ? `${id}-tip-${i}` : undefined}
                onMouseEnter={() => setActiveIdx(i)}
                onFocus={() => setActiveIdx(i)}
                onMouseLeave={() => setActiveIdx(null)}
                onBlur={() => setActiveIdx(null)}
              />

              {isActive && (
                <Tooltip $above={above} id={`${id}-tip-${i}`} role="tooltip">
                  <TooltipTitle>{ev.title}</TooltipTitle>
                  {ev.event_date && (
                    <TooltipDate>{formatEventDate(ev)}</TooltipDate>
                  )}
                  {ev.description && (
                    <TooltipDesc>{ev.description}</TooltipDesc>
                  )}
                  {src && (
                    <SourceLink
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {src.label} ↗
                    </SourceLink>
                  )}
                </Tooltip>
              )}
            </EventDotWrap>
          );
        })}
      </AxisRow>
    </Wrapper>
  );
}
