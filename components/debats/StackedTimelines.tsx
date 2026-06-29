"use client";

/**
 * components/debats/StackedTimelines.tsx
 *
 * Overlapping life timeline tracks for all people.
 * - Each track: horizontal birth→death bar on shared time axis.
 * - Contributors styled distinctly (gold, starred).
 * - life_events dots on each track.
 * - Highlighted 1844–46 serialization window.
 * - Per-track toggle visibility.
 * - Drag-to-reorder tracks with dnd-kit.
 * - "Contributors only" filter.
 * - prefers-reduced-motion: static stacked bars, no drag animations.
 */

import React, { useState, useMemo } from "react";
import styled from "styled-components";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { LifeEvent } from "@/lib/people";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelinePerson {
  id: string;
  slug: string;
  name: string;
  is_contributor: boolean;
  birth: number | null;
  death: number | null;
  beat: string | null;
  life_events: LifeEvent[];
}

interface StackedTimelinesProps {
  people: TimelinePerson[];
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SERIALIZATION_START = 1844 + 7 / 12; // Aug 1844
const SERIALIZATION_END   = 1846 + 7 / 12; // Aug 1846

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Container = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const AxisContainer = styled.div`
  position: relative;
  margin-bottom: 2rem;
`;

const AxisLabels = styled.div`
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.3rem;
  padding: 0 6px;
  font-family: var(--font-labels-stack);
  font-size: 0.6rem;
  color: var(--ink-muted);
`;

const SerializationBandWrapper = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 0;
`;

const SerBand = styled.div<{ $left: string; $width: string }>`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${({ $left }) => $left};
  width: ${({ $width }) => $width};
  background: rgba(201, 162, 75, 0.10);
  border-left: 1px dashed var(--gilt-warm);
  border-right: 1px dashed var(--gilt-warm);
`;

const SerLabel = styled.div<{ $left: string }>`
  position: absolute;
  top: -20px;
  left: ${({ $left }) => $left};
  transform: translateX(-50%);
  font-size: 0.58rem;
  font-family: var(--font-labels-stack);
  color: var(--gilt-deep);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
`;

const TrackList = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
`;

const TrackRow = styled.div<{ $visible: boolean; $isDragging?: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 2px 0;
  opacity: ${({ $visible }) => ($visible ? 1 : 0.3)};
  background: ${({ $isDragging }) => ($isDragging ? "rgba(201,162,75,0.06)" : "transparent")};
  user-select: none;
`;

const DragHandle = styled.span`
  cursor: grab;
  color: var(--ink-muted);
  font-size: 0.8rem;
  padding: 0 0.2rem;
  &:active { cursor: grabbing; }
`;

const TrackLabel = styled.a`
  flex-shrink: 0;
  width: 130px;
  font-family: var(--font-labels-stack);
  font-size: 0.68rem;
  color: var(--ink-secondary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover { color: var(--gilt-deep); }
`;

const ContributorLabel = styled(TrackLabel)`
  color: var(--gilt-deep);
  font-weight: 600;
`;

const BarWrap = styled.div`
  flex: 1;
  position: relative;
  height: 16px;
`;

const LifeBar = styled.div<{ $left: string; $width: string; $isContrib: boolean }>`
  position: absolute;
  top: 50%;
  left: ${({ $left }) => $left};
  width: ${({ $width }) => $width};
  height: ${({ $isContrib }) => ($isContrib ? "8px" : "5px")};
  transform: translateY(-50%);
  background: ${({ $isContrib }) =>
    $isContrib
      ? "linear-gradient(to right, var(--gilt-warm), var(--gilt-deep))"
      : "var(--rule-strong)"};
  border-radius: 1px;
`;

const EventDot = styled.button<{ $left: string }>`
  position: absolute;
  top: 50%;
  left: ${({ $left }) => $left};
  display: block;
  transform: translate(-50%, -50%);
  transform-origin: center center;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid var(--paper-base);
  background: var(--gilt-warm);
  padding: 0;
  cursor: pointer;
  z-index: 2;

  &:hover { transform: translate(-50%, -50%) scale(1.6); }
`;

const ToggleBtn = styled.button<{ $visible: boolean }>`
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  border: 1px solid var(--rule-mid);
  background: ${({ $visible }) => ($visible ? "var(--gilt-warm)" : "transparent")};
  cursor: pointer;
  padding: 0;
  border-radius: 2px;
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Extent { minYear: number; maxYear: number }

function computeExtent(people: TimelinePerson[]): Extent {
  let min = 9999;
  let max = 0;
  for (const p of people) {
    if (p.birth && p.birth < min) min = p.birth;
    const end = p.death ?? new Date().getFullYear();
    if (end > max) max = end;
  }
  return { minYear: min - 5, maxYear: max + 5 };
}

function toPercent(year: number, extent: Extent): string {
  const span = extent.maxYear - extent.minYear;
  return `${Math.max(0, Math.min(100, ((year - extent.minYear) / span) * 100)).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Sortable track row
// ---------------------------------------------------------------------------

interface SortableTrackProps {
  person: TimelinePerson;
  visible: boolean;
  extent: Extent;
  reduced: boolean;
  onToggle: () => void;
}

function SortableTrack({ person, visible, extent, reduced, onToggle }: SortableTrackProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: person.id,
    disabled: reduced,
  });

  const style = reduced
    ? {}
    : {
        transform: CSS.Transform.toString(transform),
        transition,
      };

  const birth = person.birth ?? extent.minYear;
  const end = person.death ?? new Date().getFullYear();
  const barLeft = toPercent(birth, extent);
  const barWidth = toPercent(end, extent); // percent from left for end
  const barWidthActual = `${Math.max(0, parseFloat(barWidth) - parseFloat(barLeft)).toFixed(2)}%`;

  const sortedEvents = [...person.life_events]
    .filter((e) => e.event_date)
    .sort((a, b) => (a.event_date! < b.event_date! ? -1 : 1));

  const LabelComponent = person.is_contributor ? ContributorLabel : TrackLabel;

  return (
    <TrackRow ref={setNodeRef} style={style} $visible={visible} $isDragging={isDragging}>
      {!reduced && (
        <DragHandle {...attributes} {...listeners} aria-label="Drag to reorder" title="Drag to reorder">
          ⠿
        </DragHandle>
      )}
      <ToggleBtn $visible={visible} onClick={onToggle} aria-label={`Toggle ${person.name}`} />
      <LabelComponent href={`/people/${person.slug}`} title={person.name}>
        {person.is_contributor ? "✦ " : ""}{person.name}
      </LabelComponent>
      <BarWrap>
        <LifeBar $left={barLeft} $width={barWidthActual} $isContrib={person.is_contributor} />
        {sortedEvents.map((ev, i) => {
          const yr = parseInt(ev.event_date!.slice(0, 4), 10);
          return (
            <EventDot
              key={i}
              $left={toPercent(yr, extent)}
              title={`${ev.title} (${ev.event_date?.slice(0, 4)})`}
              aria-label={ev.title}
              onClick={() => {}}
            />
          );
        })}
      </BarWrap>
    </TrackRow>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function StackedTimelines({ people }: StackedTimelinesProps) {
  const reduced = useReducedMotion();
  const [order, setOrder] = useState<string[]>(() => people.map((p) => p.id));
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const filtered = useMemo(() => {
    const poolMap = new Map(people.map((p) => [p.id, p]));
    return order.filter((id) => poolMap.has(id)).map((id) => poolMap.get(id)!);
  }, [people, order]);

  const visiblePeople = filtered.filter((p) => !hidden.has(p.id));
  const extent = useMemo(() => computeExtent(visiblePeople.length > 0 ? visiblePeople : filtered), [visiblePeople, filtered]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setOrder((prev) => {
        const oldIdx = prev.indexOf(active.id as string);
        const newIdx = prev.indexOf(over.id as string);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  }

  function toggleVisible(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Serialization band positions
  const serLeft = toPercent(SERIALIZATION_START, extent);
  const serRight = toPercent(SERIALIZATION_END, extent);
  const serWidth = `${Math.max(0, parseFloat(serRight) - parseFloat(serLeft)).toFixed(2)}%`;
  const serCenter = `${((parseFloat(serLeft) + parseFloat(serRight)) / 2).toFixed(2)}%`;

  const axisYears = useMemo(() => {
    const span = extent.maxYear - extent.minYear;
    const step = span > 200 ? 50 : span > 100 ? 25 : span > 50 ? 10 : 5;
    const years: number[] = [];
    const start = Math.ceil(extent.minYear / step) * step;
    for (let y = start; y <= extent.maxYear; y += step) years.push(y);
    return years;
  }, [extent]);

  const tracks = (
    <TrackList>
      {filtered.map((p) => (
        <SortableTrack
          key={p.id}
          person={p}
          visible={!hidden.has(p.id)}
          extent={extent}
          reduced={reduced}
          onToggle={() => toggleVisible(p.id)}
        />
      ))}
    </TrackList>
  );

  return (
    <Container>
      {!reduced && (
        <p style={{ fontSize: "0.68rem", fontFamily: "var(--font-labels-stack)", color: "var(--ink-muted)", marginBottom: "1rem" }}>
          Drag ⠿ handles to reorder tracks. Toggle checkboxes to show/hide.
        </p>
      )}

      <AxisContainer>
        <SerLabel $left={serCenter}>Monte Cristo 1844–46</SerLabel>
        <AxisLabels>
          {axisYears.map((y) => (
            <span key={y} style={{ position: "absolute", left: toPercent(y, extent), transform: "translateX(-50%)" }}>
              {y}
            </span>
          ))}
        </AxisLabels>

        <SerializationBandWrapper>
          <SerBand $left={serLeft} $width={serWidth} />
        </SerializationBandWrapper>

        {reduced ? (
          tracks
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              {tracks}
            </SortableContext>
          </DndContext>
        )}
      </AxisContainer>
    </Container>
  );
}
