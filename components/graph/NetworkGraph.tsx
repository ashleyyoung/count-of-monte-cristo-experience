"use client";

/**
 * components/graph/NetworkGraph.tsx
 *
 * Global relationship graph — reads persisted coordinates from graph_layout.
 * Renders all people connected by relationships.
 *
 * Features:
 *  - Degree-based node radius.
 *  - Beat/category fill colors in sepia palette.
 *  - Contributor gilt ring (is_contributor = true).
 *  - Slightly curved, opacity/dash-varied edges by relationship kind.
 *  - Hover highlights node + neighbors; dims others.
 *  - Click navigates to /people/[slug].
 *  - Responsive: fills container; viewBox scales.
 *  - prefers-reduced-motion → static list fallback.
 *  - If no persisted coords → computes live via layoutGraph.
 */

import React, { useCallback, useMemo, useReducer, useRef, useEffect, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/navigation";
import {
  nodeColor,
  degreeRadius,
  edgeStyle,
  curvedPath,
  scaleCoords,
  CONTRIBUTOR_STROKE,
  LABEL_FONT_SIZE,
} from "./graphTokens";
import type { GraphPerson, GraphRelationship } from "@/lib/graph-layout";
import { layoutGraph, DEFAULT_OPTS } from "@/lib/graph-layout";
import type { LayoutOpts } from "@/lib/graph-layout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersistedCoord {
  person_id: string;
  x: number;
  y: number;
}

export interface NetworkGraphProps {
  people: GraphPerson[];
  relationships: GraphRelationship[];
  coords: PersistedCoord[];          // empty → compute live
  opts?: Partial<LayoutOpts>;
  /** Optional: label show mode. "hover" = on hover only; "all" = always show; "none" = never. */
  labelMode?: "hover" | "all" | "none";
  width?: number;
  height?: number;
  onNodeClick?: (person: GraphPerson) => void;
}

// ---------------------------------------------------------------------------
// Styled shell
// ---------------------------------------------------------------------------

const GraphWrapper = styled.div`
  width: 100%;
  height: 100%;
  min-height: 320px;
  position: relative;
  background: var(--paper-feature);
  border: 1px solid var(--rule-light);
`;

const Svg = styled.svg`
  display: block;
  width: 100%;
  height: 100%;
`;

const FallbackList = styled.ul`
  margin: 0;
  padding: 1rem 1.5rem;
  list-style: none;
  font-family: var(--font-body-stack);
  font-size: 0.875rem;
  color: var(--ink-secondary);
  columns: 2;
  gap: 1rem;

  li {
    margin-bottom: 0.35rem;

    a {
      color: var(--gilt-deep);
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }
  }
`;

// ---------------------------------------------------------------------------
// Hover state reducer
// ---------------------------------------------------------------------------

interface HoverState {
  hoveredId: string | null;
  neighborIds: Set<string>;
}

function buildNeighborSet(personId: string, rels: GraphRelationship[]): Set<string> {
  const s = new Set<string>();
  for (const r of rels) {
    if (r.from_person === personId) s.add(r.to_person);
    else if (r.to_person === personId) s.add(r.from_person);
  }
  return s;
}

type HoverAction = { type: "hover"; id: string; rels: GraphRelationship[] } | { type: "clear" };

function hoverReducer(_: HoverState, action: HoverAction): HoverState {
  if (action.type === "clear") return { hoveredId: null, neighborIds: new Set() };
  return {
    hoveredId: action.id,
    neighborIds: buildNeighborSet(action.id, action.rels),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NetworkGraph({
  people,
  relationships,
  coords: persistedCoords,
  opts,
  labelMode = "hover",
  width: propW,
  height: propH,
  onNodeClick,
}: NetworkGraphProps) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ w: propW ?? 800, h: propH ?? 500 });
  const [hover, dispatchHover] = useReducer(hoverReducer, {
    hoveredId: null,
    neighborIds: new Set<string>(),
  });

  // Observe container resize
  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSvgSize({ w: width, h: height });
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  // Reduced-motion check (lazy init avoids a synchronous setState in the effect)
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Resolve coordinates: persisted or live-computed
  const coordMap = useMemo<Map<string, { x: number; y: number }>>(() => {
    if (persistedCoords.length > 0) {
      return new Map(persistedCoords.map((c) => [c.person_id, { x: c.x, y: c.y }]));
    }
    // Live fallback
    const live = layoutGraph(people, relationships, opts ?? DEFAULT_OPTS);
    return live;
  }, [people, relationships, persistedCoords, opts]);

  // Degree map
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of people) m.set(p.id, 0);
    for (const r of relationships) {
      m.set(r.from_person, (m.get(r.from_person) ?? 0) + 1);
      m.set(r.to_person, (m.get(r.to_person) ?? 0) + 1);
    }
    return m;
  }, [people, relationships]);

  const maxDegree = useMemo(() => Math.max(1, ...degreeMap.values()), [degreeMap]);

  // Scale coords to SVG space
  const flatCoords = useMemo(() => {
    return people
      .filter((p) => coordMap.has(p.id))
      .map((p) => ({ id: p.id, x: coordMap.get(p.id)!.x, y: coordMap.get(p.id)!.y }));
  }, [people, coordMap]);

  const scaled = useMemo(
    () => scaleCoords(flatCoords, svgSize.w, svgSize.h),
    [flatCoords, svgSize],
  );

  const handleNodeClick = useCallback(
    (person: GraphPerson) => {
      if (onNodeClick) { onNodeClick(person); return; }
      router.push(`/people/${person.slug}`);
    },
    [router, onNodeClick],
  );

  // ---------------------------------------------------------------------------
  // Reduced-motion fallback: static list
  // ---------------------------------------------------------------------------
  if (reducedMotion) {
    const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
    return (
      <GraphWrapper>
        <FallbackList aria-label="All people in the network">
          {sorted.map((p) => (
            <li key={p.id}>
              <a href={`/people/${p.slug}`}>{p.name}</a>
              {p.is_contributor && " ✦"}
            </li>
          ))}
        </FallbackList>
      </GraphWrapper>
    );
  }

  // ---------------------------------------------------------------------------
  // SVG graph
  // ---------------------------------------------------------------------------
  return (
    <GraphWrapper ref={wrapperRef} aria-label="Relationship network graph">
      <Svg
        viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
        role="img"
        aria-hidden="false"
      >
        {/* Defs: gilt gradient for contributor ring */}
        <defs>
          <radialGradient id="gilt-ring" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e7c878" />
            <stop offset="100%" stopColor="#a07f30" />
          </radialGradient>
          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        <g aria-hidden="true">
          {relationships.map((rel, i) => {
            const fromPos = scaled.get(rel.from_person);
            const toPos = scaled.get(rel.to_person);
            if (!fromPos || !toPos) return null;
            const style = edgeStyle(rel.kind);
            const isHighlighted =
              hover.hoveredId === rel.from_person ||
              hover.hoveredId === rel.to_person;
            const isDimmed =
              hover.hoveredId !== null && !isHighlighted;
            return (
              <path
                key={i}
                d={curvedPath(fromPos.x, fromPos.y, toPos.x, toPos.y)}
                fill="none"
                stroke="var(--rule-mid)"
                strokeWidth={isHighlighted ? 1.8 : 1}
                strokeDasharray={style.strokeDasharray}
                opacity={isDimmed ? style.opacity * 0.2 : isHighlighted ? 1 : style.opacity}
                style={{ transition: "opacity 0.15s, stroke-width 0.15s" }}
              />
            );
          })}
        </g>

        {/* Nodes + labels */}
        <g>
          {people.map((person) => {
            const pos = scaled.get(person.id);
            if (!pos) return null;
            const degree = degreeMap.get(person.id) ?? 0;
            const r = degreeRadius(degree, maxDegree);
            const fill = nodeColor(person.beat, person.category);
            const isHovered = hover.hoveredId === person.id;
            const isNeighbor = hover.neighborIds.has(person.id);
            const isDimmed = hover.hoveredId !== null && !isHovered && !isNeighbor;
            const showLabel =
              labelMode === "all" ||
              (labelMode === "hover" && (isHovered || isNeighbor));

            return (
              <g
                key={person.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                style={{ cursor: "pointer" }}
                onClick={() => handleNodeClick(person)}
                onMouseEnter={() =>
                  dispatchHover({ type: "hover", id: person.id, rels: relationships })
                }
                onMouseLeave={() => dispatchHover({ type: "clear" })}
                role="button"
                tabIndex={0}
                aria-label={person.name}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") handleNodeClick(person);
                }}
              >
                {/* Contributor gilt ring */}
                {person.is_contributor && (
                  <circle
                    r={r + CONTRIBUTOR_STROKE + 1}
                    fill="url(#gilt-ring)"
                    opacity={isDimmed ? 0.15 : isHovered ? 1 : 0.85}
                    style={{ transition: "opacity 0.15s" }}
                  />
                )}
                {/* Main node */}
                <circle
                  r={isHovered ? r * 1.25 : r}
                  fill={fill}
                  stroke={isHovered ? "var(--gilt-warm)" : "var(--rule-light)"}
                  strokeWidth={isHovered ? 1.5 : 0.8}
                  opacity={isDimmed ? 0.2 : 1}
                  filter={isHovered ? "url(#node-glow)" : undefined}
                  style={{ transition: "opacity 0.15s, stroke 0.12s" }}
                />
                {/* Label */}
                {showLabel && (
                  <text
                    y={-r - 5}
                    textAnchor="middle"
                    fontSize={LABEL_FONT_SIZE}
                    fontFamily="var(--font-labels-stack)"
                    fill="var(--ink-secondary)"
                    stroke="var(--paper-base)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    style={{ pointerEvents: "none", userSelect: "none" }}
                  >
                    {person.name}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </Svg>
    </GraphWrapper>
  );
}
