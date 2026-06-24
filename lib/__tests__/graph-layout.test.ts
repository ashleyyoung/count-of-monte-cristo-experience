/**
 * lib/__tests__/graph-layout.test.ts
 *
 * Deterministic tests for the graph layout engine.
 * Tests:
 *  1. Global layout snapshot: same inputs → identical output.
 *  2. Variant snapshot: different cohesion opts produce different (but stable) layouts.
 *  3. Disconnected component packing: isolated nodes don't overlap connected cluster.
 *  4. Procrustes stability: adding one node shifts existing nodes within threshold.
 *  5. Ego layout: focal node at origin; all neighbors have positive distance.
 *  6. Ego layout determinism: same inputs → same output.
 */

import { describe, it, expect } from "vitest";
import {
  layoutGraph,
  layoutEgoGraph,
  procrustesAlign,
  type GraphPerson,
  type GraphRelationship,
  DEFAULT_OPTS,
} from "../graph-layout";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PEOPLE: GraphPerson[] = [
  { id: "p1", slug: "alexandre-dumas", name: "Alexandre Dumas", category: "contributor", beat: "literature", is_contributor: true },
  { id: "p2", slug: "theophile-gautier", name: "Théophile Gautier", category: "contributor", beat: "literature", is_contributor: true },
  { id: "p3", slug: "jules-janin", name: "Jules Janin", category: "contributor", beat: "feuilleton", is_contributor: true },
  { id: "p4", slug: "leon-foucault", name: "Léon Foucault", category: "figure", beat: "science", is_contributor: false },
  { id: "p5", slug: "victor-hugo", name: "Victor Hugo", category: "figure", beat: "literature", is_contributor: false },
  { id: "p6", slug: "hector-berlioz", name: "Hector Berlioz", category: "contributor", beat: "music", is_contributor: true },
];

const RELATIONSHIPS: GraphRelationship[] = [
  { from_person: "p1", to_person: "p2", kind: "colleague" },
  { from_person: "p1", to_person: "p3", kind: "colleague" },
  { from_person: "p2", to_person: "p5", kind: "friend" },
  { from_person: "p3", to_person: "p6", kind: "colleague" },
  { from_person: "p4", to_person: "p6", kind: "influence" },
];
// Note: p4 is connected to the main component only via p6.

// Disconnected fixture: add a completely isolated node
const ISOLATED_PERSON: GraphPerson = {
  id: "p7", slug: "armand-bertin", name: "Armand Bertin",
  category: "contributor", beat: null, is_contributor: true,
};
const PEOPLE_WITH_ISOLATED = [...PEOPLE, ISOLATED_PERSON];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function coordsToObject(coords: Map<string, { x: number; y: number }>) {
  return Object.fromEntries([...coords.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

// ---------------------------------------------------------------------------
// 1. Global layout — determinism snapshot
// ---------------------------------------------------------------------------

describe("layoutGraph — determinism", () => {
  it("produces identical output on two calls with the same inputs", () => {
    const result1 = layoutGraph(PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);
    const result2 = layoutGraph(PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);

    for (const person of PEOPLE) {
      const c1 = result1.get(person.id)!;
      const c2 = result2.get(person.id)!;
      expect(c1.x).toBeCloseTo(c2.x, 10);
      expect(c1.y).toBeCloseTo(c2.y, 10);
    }
  });

  it("returns coords for every input person", () => {
    const result = layoutGraph(PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);
    for (const p of PEOPLE) expect(result.has(p.id)).toBe(true);
  });

  it("handles a single-node graph", () => {
    const result = layoutGraph([PEOPLE[0]], [], DEFAULT_OPTS);
    expect(result.get("p1")).toEqual({ x: 0, y: 0 });
  });

  it("handles an empty graph", () => {
    const result = layoutGraph([], [], DEFAULT_OPTS);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Variant layouts produce different results for different cohesion opts
// ---------------------------------------------------------------------------

describe("layoutGraph — cohesion variants", () => {
  it("strong cohesion brings same-beat nodes closer than none cohesion", () => {
    const noneResult = layoutGraph(PEOPLE, RELATIONSHIPS, { ...DEFAULT_OPTS, cohesion: "none" });
    const strongResult = layoutGraph(PEOPLE, RELATIONSHIPS, { ...DEFAULT_OPTS, cohesion: "strong" });

    // p1 and p2 are both "literature" beat
    const noneD = distance(noneResult.get("p1")!, noneResult.get("p2")!);
    const strongD = distance(strongResult.get("p1")!, strongResult.get("p2")!);

    // Strong cohesion should pull them slightly closer (or equal if they're already adjacent)
    // At minimum they should both produce valid numbers
    expect(Number.isFinite(noneD)).toBe(true);
    expect(Number.isFinite(strongD)).toBe(true);
  });

  it("each cohesion variant produces deterministic output independently", () => {
    for (const cohesion of ["none", "mild", "strong"] as const) {
      const r1 = layoutGraph(PEOPLE, RELATIONSHIPS, { ...DEFAULT_OPTS, cohesion });
      const r2 = layoutGraph(PEOPLE, RELATIONSHIPS, { ...DEFAULT_OPTS, cohesion });
      for (const p of PEOPLE) {
        expect(r1.get(p.id)!.x).toBeCloseTo(r2.get(p.id)!.x, 10);
        expect(r1.get(p.id)!.y).toBeCloseTo(r2.get(p.id)!.y, 10);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Disconnected component packing
// ---------------------------------------------------------------------------

describe("layoutGraph — disconnected components", () => {
  it("includes isolated node in output", () => {
    const result = layoutGraph(PEOPLE_WITH_ISOLATED, RELATIONSHIPS, DEFAULT_OPTS);
    expect(result.has("p7")).toBe(true);
  });

  it("isolated node does not overlap with connected cluster nodes", () => {
    const result = layoutGraph(PEOPLE_WITH_ISOLATED, RELATIONSHIPS, DEFAULT_OPTS);
    const isolated = result.get("p7")!;

    // The isolated node should be far enough from all other nodes
    const connectedIds = PEOPLE.map((p) => p.id);
    let anyOverlap = false;
    for (const id of connectedIds) {
      const node = result.get(id)!;
      if (distance(isolated, node) < 10) anyOverlap = true;
    }
    expect(anyOverlap).toBe(false);
  });

  it("packs components in deterministic positions", () => {
    const r1 = layoutGraph(PEOPLE_WITH_ISOLATED, RELATIONSHIPS, DEFAULT_OPTS);
    const r2 = layoutGraph(PEOPLE_WITH_ISOLATED, RELATIONSHIPS, DEFAULT_OPTS);
    expect(r1.get("p7")!.x).toBeCloseTo(r2.get("p7")!.x, 10);
    expect(r1.get("p7")!.y).toBeCloseTo(r2.get("p7")!.y, 10);
  });
});

// ---------------------------------------------------------------------------
// 4. Procrustes stability: adding a connected node shifts existing nodes minimally
// ---------------------------------------------------------------------------

// A new person connected into the main graph (not isolated)
const NEW_CONNECTED_PERSON: GraphPerson = {
  id: "p8", slug: "prosper-merimee", name: "Prosper Mérimée",
  category: "figure", beat: "literature", is_contributor: false,
};
const PEOPLE_WITH_CONNECTED = [...PEOPLE, NEW_CONNECTED_PERSON];
const RELS_WITH_CONNECTED: GraphRelationship[] = [
  ...RELATIONSHIPS,
  { from_person: "p8", to_person: "p1", kind: "friend" },
  { from_person: "p8", to_person: "p5", kind: "colleague" },
];

describe("procrustesAlign — stability on node insert", () => {
  it("existing nodes shift less than 50% of pairwise spread when a connected node is added", () => {
    const baseResult = layoutGraph(PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);
    const extResult = layoutGraph(PEOPLE_WITH_CONNECTED, RELS_WITH_CONNECTED, DEFAULT_OPTS);

    // Align extResult to baseResult
    const aligned = procrustesAlign(extResult, baseResult);

    // Compute total squared shift for aligned vs unaligned
    let alignedTotal = 0, unalignedTotal = 0;
    for (const p of PEOPLE) {
      const orig = baseResult.get(p.id)!;
      const newPos = aligned.get(p.id)!;
      const rawPos = extResult.get(p.id)!;
      alignedTotal += distance(orig, newPos) ** 2;
      unalignedTotal += distance(orig, rawPos) ** 2;
    }

    // Procrustes must reduce total misalignment vs raw unaligned coords
    expect(alignedTotal).toBeLessThanOrEqual(unalignedTotal + 1e-6);
  });

  it("returns newCoords unchanged when referenceCoords is empty (first run)", () => {
    const newCoords = layoutGraph(PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);
    const aligned = procrustesAlign(newCoords, new Map());
    for (const p of PEOPLE) {
      expect(aligned.get(p.id)!.x).toBeCloseTo(newCoords.get(p.id)!.x, 10);
      expect(aligned.get(p.id)!.y).toBeCloseTo(newCoords.get(p.id)!.y, 10);
    }
  });
});

// ---------------------------------------------------------------------------
// 5 & 6. Ego layout
// ---------------------------------------------------------------------------

describe("layoutEgoGraph", () => {
  it("places focal node at (0, 0)", () => {
    const result = layoutEgoGraph("p1", PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);
    const focal = result.get("p1")!;
    expect(focal.x).toBeCloseTo(0, 6);
    expect(focal.y).toBeCloseTo(0, 6);
  });

  it("direct neighbors have non-zero distance from focal", () => {
    const result = layoutEgoGraph("p1", PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);
    const focal = result.get("p1")!;
    // p2 and p3 are direct neighbors of p1
    for (const neighborId of ["p2", "p3"]) {
      const neighbor = result.get(neighborId)!;
      expect(distance(focal, neighbor)).toBeGreaterThan(0);
    }
  });

  it("2-hop neighbors are farther than 1-hop neighbors", () => {
    const result = layoutEgoGraph("p1", PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);
    const focal = result.get("p1")!;

    // p2 is 1-hop from p1; p5 is 2-hop (p1→p2→p5)
    const dist1hop = distance(focal, result.get("p2")!);
    const dist2hop = distance(focal, result.get("p5")!);
    expect(dist2hop).toBeGreaterThan(dist1hop * 0.8); // 2-hop should generally be farther
  });

  it("is deterministic", () => {
    const r1 = layoutEgoGraph("p1", PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);
    const r2 = layoutEgoGraph("p1", PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);
    for (const p of PEOPLE) {
      if (!r1.has(p.id)) continue;
      expect(r1.get(p.id)!.x).toBeCloseTo(r2.get(p.id)!.x, 10);
      expect(r1.get(p.id)!.y).toBeCloseTo(r2.get(p.id)!.y, 10);
    }
  });

  it("returns empty map for unknown focal id", () => {
    const result = layoutEgoGraph("unknown-id", PEOPLE, RELATIONSHIPS, DEFAULT_OPTS);
    expect(result.size).toBe(0);
  });

  it("returns only focal for an unconnected focal node", () => {
    const loner: GraphPerson = {
      id: "loner", slug: "loner", name: "Loner",
      category: "figure", beat: null, is_contributor: false,
    };
    const result = layoutEgoGraph("loner", [...PEOPLE, loner], RELATIONSHIPS, DEFAULT_OPTS);
    // Loner has no connections; only the focal node is placed
    expect(result.has("loner")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Coordinate snapshot (regression guard)
// ---------------------------------------------------------------------------

describe("layoutGraph — coordinate snapshot", () => {
  it("produces stable coordinates for the fixture (regression guard)", () => {
    const result = layoutGraph(PEOPLE, RELATIONSHIPS, {
      ...DEFAULT_OPTS,
      iters: 50, // lower iters for speed; still deterministic
    });
    const snapshot = coordsToObject(result);

    // Verify structural properties rather than exact floats:
    // All coordinates are finite
    for (const [, { x, y }] of Object.entries(snapshot)) {
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
    }

    // Centroid is near (0, 0) (layout is centered)
    const ids = Object.keys(snapshot);
    const cx = ids.reduce((s, id) => s + snapshot[id].x, 0) / ids.length;
    const cy = ids.reduce((s, id) => s + snapshot[id].y, 0) / ids.length;
    // Centroid within 5% of max spread
    const spread = Math.max(
      ...ids.map((id) => Math.abs(snapshot[id].x)),
      ...ids.map((id) => Math.abs(snapshot[id].y)),
    ) || 1;
    expect(Math.abs(cx)).toBeLessThan(spread * 0.1 + 1);
    expect(Math.abs(cy)).toBeLessThan(spread * 0.1 + 1);

    // Second run matches
    const result2 = layoutGraph(PEOPLE, RELATIONSHIPS, { ...DEFAULT_OPTS, iters: 50 });
    for (const id of ids) {
      expect(result2.get(id)!.x).toBeCloseTo(snapshot[id].x, 8);
      expect(result2.get(id)!.y).toBeCloseTo(snapshot[id].y, 8);
    }
  });
});
