"use client";

/**
 * components/graph/graphTokens.ts
 * Shared constants for graph rendering — beat/category colors in sepia palette,
 * sizing, and rendering helpers.
 */

// Node radius range (by degree)
export const MIN_RADIUS = 6;
export const MAX_RADIUS = 20;
export const CONTRIBUTOR_STROKE = 2.5; // gilt ring width
export const LABEL_FONT_SIZE = 11;

// Beat → sepia-compatible fill tint.
// Keys are the nine beats allowed by the people.beat check constraint
// (music, drama, art, literature, science, politics, foreign, economics, direction).
export const BEAT_COLORS: Record<string, string> = {
  // Arts & letters
  literature:  "#c4a87a",
  art:         "#b8966e",
  music:       "#c0a060",
  drama:       "#b89060",

  // Science
  science:     "#9ab0a0",

  // Politics / economics / foreign affairs
  politics:    "#8a7060",
  foreign:     "#937860",
  economics:   "#a08868",

  // Editorial direction
  direction:   "#a07f30",
};

export const CATEGORY_COLORS: Record<string, string> = {
  contributor: "#c9a24b",   // gilt — primary actors
  figure:      "#9ab0a0",   // sage — historical figures
  royalty:     "#a07f30",   // deep gilt — royalty / rulers
};

export function nodeColor(
  beat: string | null,
  category: string,
): string {
  if (beat && BEAT_COLORS[beat.toLowerCase()]) return BEAT_COLORS[beat.toLowerCase()];
  return CATEGORY_COLORS[category] ?? "#b9a578";
}

export function degreeRadius(degree: number, maxDegree: number): number {
  if (maxDegree === 0) return MIN_RADIUS;
  const t = Math.min(degree / maxDegree, 1);
  return MIN_RADIUS + t * (MAX_RADIUS - MIN_RADIUS);
}

// Relationship kind → edge opacity and dash pattern.
// Kinds match the relationships.kind check constraint
// (family, romantic, friend, rival, mentor, collaborator, patron, royalty, professional).
export function edgeStyle(kind: string): { opacity: number; strokeDasharray?: string } {
  switch (kind) {
    case "family":       return { opacity: 0.80 };
    case "romantic":     return { opacity: 0.75 };
    case "friend":       return { opacity: 0.70 };
    case "collaborator": return { opacity: 0.60 };
    case "professional": return { opacity: 0.55 };
    case "patron":       return { opacity: 0.55 };
    case "mentor":       return { opacity: 0.50, strokeDasharray: "6 3" };
    case "royalty":      return { opacity: 0.50 };
    case "rival":        return { opacity: 0.40, strokeDasharray: "4 3" };
    default:             return { opacity: 0.40 };
  }
}

/** Curved SVG path between two points. Curvature offset ~20% of distance. */
export function curvedPath(
  x1: number, y1: number,
  x2: number, y2: number,
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1, dy = y2 - y1;
  // Perpendicular offset
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const curve = len * 0.12;
  const cx = mx - (dy / len) * curve;
  const cy = my + (dx / len) * curve;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

/** Scale coords from layout space to SVG viewBox. */
export function scaleCoords(
  coords: Array<{ id: string; x: number; y: number }>,
  svgW: number,
  svgH: number,
  padding = 48,
): Map<string, { x: number; y: number }> {
  if (coords.length === 0) return new Map();

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { x, y } of coords) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const dataW = maxX - minX || 1;
  const dataH = maxY - minY || 1;
  const scX = (svgW - padding * 2) / dataW;
  const scY = (svgH - padding * 2) / dataH;
  const scale = Math.min(scX, scY);
  const offX = padding + ((svgW - padding * 2) - dataW * scale) / 2;
  const offY = padding + ((svgH - padding * 2) - dataH * scale) / 2;

  return new Map(
    coords.map(({ id, x, y }) => [
      id,
      { x: offX + (x - minX) * scale, y: offY + (y - minY) * scale },
    ]),
  );
}
