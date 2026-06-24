"use client";

/**
 * components/graph/RelationshipGraph.tsx
 *
 * Ego (per-profile) relationship graph — focal node centered, 1-hop neighbors
 * on concentric rings by BFS hop distance. Computed live (not persisted).
 *
 * Features mirror NetworkGraph but sized for the profile sidebar/section.
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
import { layoutEgoGraph, DEFAULT_OPTS } from "@/lib/graph-layout";
import type { LayoutOpts } from "@/lib/graph-layout";

// ---------------------------------------------------------------------------
// Styled shell
// ---------------------------------------------------------------------------

const GraphWrapper = styled.div`
  width: 100%;
  min-height: 280px;
  position: relative;
  background: var(--paper-card);
  border: 1px solid var(--rule-light);
  border-radius: 2px;
`;

const Svg = styled.svg`
  display: block;
  width: 100%;
  height: 100%;
`;

const FallbackList = styled.ul`
  margin: 0;
  padding: 0.75rem 1rem;
  list-style: none;
  font-size: 0.8rem;
  color: var(--ink-secondary);

  li {
    margin-bottom: 0.25rem;
    a {
      color: var(--gilt-deep);
      text-decoration: none;
      &:hover { text-decoration: underline; }
    }
  }
`;

const FocalLabel = styled.text`
  font-family: var(--font-display-stack);
  fill: var(--ink-primary);
  stroke: var(--paper-card);
  stroke-width: 3px;
  paint-order: stroke;
  pointer-events: none;
  user-select: none;
`;

// ---------------------------------------------------------------------------
// Hover reducer (same pattern as NetworkGraph)
// ---------------------------------------------------------------------------

interface HoverState { hoveredId: string | null; neighborIds: Set<string> }
type HoverAction = { type: "hover"; id: string; rels: GraphRelationship[] } | { type: "clear" };

function buildNeighborSet(id: string, rels: GraphRelationship[]): Set<string> {
  const s = new Set<string>();
  for (const r of rels) {
    if (r.from_person === id) s.add(r.to_person);
    else if (r.to_person === id) s.add(r.from_person);
  }
  return s;
}

function hoverReducer(_: HoverState, action: HoverAction): HoverState {
  if (action.type === "clear") return { hoveredId: null, neighborIds: new Set() };
  return { hoveredId: action.id, neighborIds: buildNeighborSet(action.id, action.rels) };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RelationshipGraphProps {
  focalPerson: GraphPerson;
  /** All people in the graph universe (focal + all connected people). */
  people: GraphPerson[];
  relationships: GraphRelationship[];
  opts?: Partial<LayoutOpts>;
  labelMode?: "hover" | "all" | "none";
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RelationshipGraph({
  focalPerson,
  people,
  relationships,
  opts,
  labelMode = "hover",
  width: propW,
  height: propH,
}: RelationshipGraphProps) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState({ w: propW ?? 560, h: propH ?? 360 });
  const [hover, dispatchHover] = useReducer(hoverReducer, {
    hoveredId: null,
    neighborIds: new Set<string>(),
  });
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    if (!wrapperRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSvgSize({ w: width, h: height });
    });
    ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const h = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Compute live ego layout
  const coordMap = useMemo(() => {
    return layoutEgoGraph(focalPerson.id, people, relationships, opts ?? DEFAULT_OPTS);
  }, [focalPerson.id, people, relationships, opts]);

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

  // Only render people that have coords (reachable from focal node)
  const visiblePeople = useMemo(
    () => people.filter((p) => coordMap.has(p.id)),
    [people, coordMap],
  );

  const flatCoords = useMemo(
    () => visiblePeople.map((p) => ({ id: p.id, ...coordMap.get(p.id)! })),
    [visiblePeople, coordMap],
  );

  const scaled = useMemo(
    () => scaleCoords(flatCoords, svgSize.w, svgSize.h, 60),
    [flatCoords, svgSize],
  );

  // Filter relationships to only visible nodes
  const visibleRels = useMemo(() => {
    const visibleIds = new Set(visiblePeople.map((p) => p.id));
    return relationships.filter(
      (r) => visibleIds.has(r.from_person) && visibleIds.has(r.to_person),
    );
  }, [visiblePeople, relationships]);

  const handleNodeClick = useCallback(
    (person: GraphPerson) => {
      if (person.id === focalPerson.id) return; // stay on page
      router.push(`/people/${person.slug}`);
    },
    [router, focalPerson.id],
  );

  // Reduced-motion fallback
  if (reducedMotion) {
    const connections = people
      .filter((p) => p.id !== focalPerson.id && coordMap.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return (
      <GraphWrapper>
        <FallbackList aria-label="Connected people">
          {connections.map((p) => (
            <li key={p.id}>
              <a href={`/people/${p.slug}`}>{p.name}</a>
              {p.is_contributor && " ✦"}
            </li>
          ))}
        </FallbackList>
      </GraphWrapper>
    );
  }

  return (
    <GraphWrapper ref={wrapperRef} aria-label={`Relationship graph for ${focalPerson.name}`}>
      <Svg viewBox={`0 0 ${svgSize.w} ${svgSize.h}`} role="img">
        <defs>
          <radialGradient id="ego-gilt-ring" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e7c878" />
            <stop offset="100%" stopColor="#a07f30" />
          </radialGradient>
          <radialGradient id="focal-grad" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#e2d6ba" />
            <stop offset="100%" stopColor="#c9a24b" />
          </radialGradient>
          <filter id="focal-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Edges */}
        <g aria-hidden="true">
          {visibleRels.map((rel, i) => {
            const fromPos = scaled.get(rel.from_person);
            const toPos = scaled.get(rel.to_person);
            if (!fromPos || !toPos) return null;
            const style = edgeStyle(rel.kind);
            const isHighlighted =
              hover.hoveredId === rel.from_person || hover.hoveredId === rel.to_person;
            const isDimmed = hover.hoveredId !== null && !isHighlighted;
            return (
              <path
                key={i}
                d={curvedPath(fromPos.x, fromPos.y, toPos.x, toPos.y)}
                fill="none"
                stroke="var(--rule-mid)"
                strokeWidth={isHighlighted ? 2 : 1}
                strokeDasharray={style.strokeDasharray}
                opacity={isDimmed ? style.opacity * 0.15 : isHighlighted ? 0.9 : style.opacity}
                style={{ transition: "opacity 0.12s, stroke-width 0.12s" }}
              />
            );
          })}
        </g>

        {/* Non-focal nodes */}
        <g>
          {visiblePeople
            .filter((p) => p.id !== focalPerson.id)
            .map((person) => {
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
                    dispatchHover({ type: "hover", id: person.id, rels: visibleRels })
                  }
                  onMouseLeave={() => dispatchHover({ type: "clear" })}
                  role="button"
                  tabIndex={0}
                  aria-label={person.name}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleNodeClick(person);
                  }}
                >
                  {person.is_contributor && (
                    <circle
                      r={r + CONTRIBUTOR_STROKE + 1}
                      fill="url(#ego-gilt-ring)"
                      opacity={isDimmed ? 0.1 : 0.8}
                      style={{ transition: "opacity 0.12s" }}
                    />
                  )}
                  <circle
                    r={isHovered ? r * 1.25 : r}
                    fill={fill}
                    stroke={isHovered ? "var(--gilt-warm)" : "var(--rule-light)"}
                    strokeWidth={isHovered ? 1.5 : 0.8}
                    opacity={isDimmed ? 0.2 : 1}
                    style={{ transition: "opacity 0.12s" }}
                  />
                  {showLabel && (
                    <text
                      y={-r - 5}
                      textAnchor="middle"
                      fontSize={LABEL_FONT_SIZE}
                      fontFamily="var(--font-labels-stack)"
                      fill="var(--ink-secondary)"
                      stroke="var(--paper-card)"
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

        {/* Focal node — rendered last so it's on top */}
        {(() => {
          const pos = scaled.get(focalPerson.id);
          if (!pos) return null;
          const r = MAX_FOCAL_RADIUS;
          return (
            <g
              transform={`translate(${pos.x}, ${pos.y})`}
              aria-label={`${focalPerson.name} (focal)`}
            >
              {/* Gilt halo */}
              <circle r={r + 5} fill="url(#focal-grad)" opacity={0.35} filter="url(#focal-glow)" />
              <circle
                r={r}
                fill="var(--paper-deep)"
                stroke="var(--gilt-warm)"
                strokeWidth={2}
              />
              <FocalLabel
                y={-r - 7}
                textAnchor="middle"
                fontSize={LABEL_FONT_SIZE + 1}
              >
                {focalPerson.name}
              </FocalLabel>
            </g>
          );
        })()}
      </Svg>
    </GraphWrapper>
  );
}

const MAX_FOCAL_RADIUS = 20;
