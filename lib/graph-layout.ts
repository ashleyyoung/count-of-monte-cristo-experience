/**
 * lib/graph-layout.ts
 *
 * Pure, deterministic relationship-graph layout engine.
 *
 * GUARANTEES:
 *  - No RNG anywhere. Same inputs + same opts → byte-identical output.
 *  - Fixed iteration counts (SMACOF, overlap-removal).
 *  - Slug tie-breaks everywhere ordering matters.
 *  - Snapshot-testable.
 *
 * PIPELINE (global graph):
 *  1. Build undirected adjacency, split into connected components.
 *  2. All-pairs BFS shortest-path distances within each component.
 *  3. Category cohesion: shrink same-beat distances.
 *  4. Classical MDS (PCoA) initial embedding from distance matrix.
 *  5. SMACOF stress majorization (fixed iters).
 *  6. Deterministic orientation: PCA long-axis → horizontal, reflect so
 *     smallest-slug node is top-left, center to (0,0).
 *  7. Pack disconnected components (largest-first, slug tie-break).
 *  8. Fit layout to targetAspect viewport.
 *  9. Organic overlap-removal (fixed-iter push-apart).
 *
 * EGO PIPELINE (per-profile graph):
 *  Focal node at center; neighbors at concentric rings by BFS hop; angles
 *  spread to group shared connections; same overlap-removal.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PersonId = string; // uuid

export interface GraphPerson {
  id: PersonId;
  slug: string;
  name: string;
  category: "contributor" | "figure" | "royalty";
  beat: string | null;
  is_contributor: boolean;
}

export interface GraphRelationship {
  from_person: PersonId;
  to_person: PersonId;
  kind: string;
  sources?: unknown[];
}

export type Cohesion = "none" | "mild" | "strong";

export interface LayoutOpts {
  cohesion: Cohesion;
  iters: number; // SMACOF iterations
  targetAspect: number; // output viewport width/height ratio
  minSeparation: number; // px between node centers for overlap removal
}

export const DEFAULT_OPTS: LayoutOpts = {
  cohesion: "none",
  iters: 200,
  targetAspect: 16 / 9,
  minSeparation: 32,
};

export type NodeCoords = Map<PersonId, { x: number; y: number }>;

// ---------------------------------------------------------------------------
// Dense matrix helpers (no external deps)
// ---------------------------------------------------------------------------

type Mat = Float64Array[]; // row-major, Mat[row][col]

function mat(rows: number, cols: number): Mat {
  return Array.from({ length: rows }, () => new Float64Array(cols));
}

/**
 * Symmetric eigendecomposition via Jacobi rotations.
 * Returns { values, vectors } where vectors[i] is eigenvector for values[i].
 * Deterministic: processes (p,q) pairs in fixed lexicographic order.
 */
function eigSymmetric(A: Mat): { values: Float64Array; vectors: Mat } {
  const n = A.length;
  // Copy A
  const S: Mat = A.map((r) => new Float64Array(r));
  // Start with identity
  const V = mat(n, n);
  for (let i = 0; i < n; i++) V[i][i] = 1;

  const ITER = 100 * n * n;
  for (let iter = 0; iter < ITER; iter++) {
    // Find largest off-diagonal element in fixed order
    let p = 0,
      q = 1,
      max = 0;
    for (let i = 0; i < n - 1; i++)
      for (let j = i + 1; j < n; j++) {
        const v = Math.abs(S[i][j]);
        if (v > max) {
          max = v;
          p = i;
          q = j;
        }
      }
    if (max < 1e-12) break;

    const theta = (S[q][q] - S[p][p]) / (2 * S[p][q]);
    const t =
      theta >= 0
        ? 1 / (theta + Math.sqrt(1 + theta * theta))
        : 1 / (theta - Math.sqrt(1 + theta * theta));
    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    // Update S
    const Spp = S[p][p] - t * S[p][q];
    const Sqq = S[q][q] + t * S[p][q];
    S[p][p] = Spp;
    S[q][q] = Sqq;
    S[p][q] = 0;
    S[q][p] = 0;
    for (let r = 0; r < n; r++) {
      if (r === p || r === q) continue;
      const Srp = c * S[r][p] - s * S[r][q];
      const Srq = s * S[r][p] + c * S[r][q];
      S[r][p] = S[p][r] = Srp;
      S[r][q] = S[q][r] = Srq;
    }
    // Update V
    for (let r = 0; r < n; r++) {
      const Vrp = c * V[r][p] - s * V[r][q];
      const Vrq = s * V[r][p] + c * V[r][q];
      V[r][p] = Vrp;
      V[r][q] = Vrq;
    }
  }

  const values = new Float64Array(n).map((_, i) => S[i][i]);
  // Sort descending by eigenvalue
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => values[b] - values[a],
  );
  const sortedVals = new Float64Array(order.map((i) => values[i]));
  // sortedVecs[i] = eigenvector i (column i of V), as a plain number[][]
  const sortedVecs: number[][] = order.map((i) => V.map((row) => row[i]));
  const vectors: Mat = mat(n, n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) vectors[i][j] = sortedVecs[i][j];

  return { values: sortedVals, vectors };
}

// ---------------------------------------------------------------------------
// Graph building
// ---------------------------------------------------------------------------

interface AdjEntry {
  neighbor: number;
  kind: string;
}

function buildAdjacency(
  nodes: GraphPerson[],
  edges: GraphRelationship[],
): AdjEntry[][] {
  const idx = new Map(nodes.map((p, i) => [p.id, i]));
  const adj: AdjEntry[][] = nodes.map(() => []);
  for (const e of edges) {
    const a = idx.get(e.from_person),
      b = idx.get(e.to_person);
    if (a === undefined || b === undefined) continue;
    adj[a].push({ neighbor: b, kind: e.kind });
    adj[b].push({ neighbor: a, kind: e.kind });
  }
  return adj;
}

/** BFS shortest paths from source; returns distances array (Infinity if unreachable). */
function bfsFrom(src: number, adj: AdjEntry[][]): number[] {
  const n = adj.length;
  const dist = new Array<number>(n).fill(Infinity);
  dist[src] = 0;
  const queue = [src];
  for (let qi = 0; qi < queue.length; qi++) {
    const u = queue[qi];
    for (const { neighbor: v } of adj[u]) {
      if (dist[v] === Infinity) {
        dist[v] = dist[u] + 1;
        queue.push(v);
      }
    }
  }
  return dist;
}

/** Find connected components via BFS; returns array of node-index arrays. */
function findComponents(adj: AdjEntry[][]): number[][] {
  const n = adj.length;
  const visited = new Uint8Array(n);
  const components: number[][] = [];
  for (let start = 0; start < n; start++) {
    if (visited[start]) continue;
    const comp: number[] = [];
    const queue = [start];
    visited[start] = 1;
    for (let qi = 0; qi < queue.length; qi++) {
      const u = queue[qi];
      comp.push(u);
      for (const { neighbor: v } of adj[u]) {
        if (!visited[v]) {
          visited[v] = 1;
          queue.push(v);
        }
      }
    }
    components.push(comp);
  }
  return components;
}

// ---------------------------------------------------------------------------
// Classical MDS (PCoA) from distance matrix
// ---------------------------------------------------------------------------

/**
 * Given n×n distance matrix D (within a single component), return n×2 coords.
 * Deterministic: Jacobi eigensolver with fixed order.
 */
function classicalMDS(D: Float64Array[], n: number): Array<[number, number]> {
  // Double-center: B = -½ H D² H  where H = I - (1/n)11ᵀ
  const D2 = mat(n, n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) D2[i][j] = D[i][j] * D[i][j];

  const rowMean = new Float64Array(n);
  const colMean = new Float64Array(n);
  let grandMean = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      rowMean[i] += D2[i][j];
      colMean[j] += D2[i][j];
    }
  }
  for (let i = 0; i < n; i++) {
    rowMean[i] /= n;
    colMean[i] /= n;
  }
  for (let i = 0; i < n; i++) grandMean += rowMean[i];
  grandMean /= n;

  const B = mat(n, n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      B[i][j] = -0.5 * (D2[i][j] - rowMean[i] - colMean[j] + grandMean);

  const { values, vectors } = eigSymmetric(B);

  // Take top 2 eigenvectors (already sorted desc)
  const coords: Array<[number, number]> = Array.from({ length: n }, () => [
    0, 0,
  ]);
  for (let dim = 0; dim < 2; dim++) {
    const lambda = Math.max(0, values[dim]);
    const scale = Math.sqrt(lambda);
    for (let i = 0; i < n; i++) {
      coords[i][dim] += vectors[dim][i] * scale;
    }
  }
  return coords;
}

// ---------------------------------------------------------------------------
// SMACOF stress majorization
// ---------------------------------------------------------------------------

function smacof(
  coords: Array<[number, number]>,
  D: Float64Array[],
  n: number,
  iters: number,
): Array<[number, number]> {
  let X = coords.map((c) => [c[0], c[1]] as [number, number]);

  // Weight matrix: w_ij = 1/d_ij² (skip pairs with d=0 or d=Inf)
  const W: Float64Array[] = Array.from(
    { length: n },
    () => new Float64Array(n),
  );
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j || D[i][j] <= 0 || !isFinite(D[i][j])) continue;
      W[i][j] = 1 / (D[i][j] * D[i][j]);
    }

  for (let iter = 0; iter < iters; iter++) {
    const Z = X;
    const newX: Array<[number, number]> = Array.from({ length: n }, () => [
      0, 0,
    ]);

    for (let i = 0; i < n; i++) {
      let sumW = 0,
        bx = 0,
        by = 0;
      for (let j = 0; j < n; j++) {
        if (i === j || W[i][j] === 0) continue;
        const dx = Z[i][0] - Z[j][0],
          dy = Z[i][1] - Z[j][1];
        const dist = Math.sqrt(dx * dx + dy * dy) || 1e-9;
        const b = (W[i][j] * D[i][j]) / dist;
        bx += b * Z[j][0];
        by += b * Z[j][1];
        sumW += W[i][j];
      }
      if (sumW > 0) {
        newX[i][0] = bx / sumW;
        newX[i][1] = by / sumW;
      } else {
        newX[i] = Z[i];
      }
    }
    X = newX;
  }
  return X;
}

// ---------------------------------------------------------------------------
// Deterministic orientation (PCA + slug tie-break reflection)
// ---------------------------------------------------------------------------

function orient(
  coords: Array<[number, number]>,
  slugs: string[],
): Array<[number, number]> {
  const n = coords.length;
  if (n === 0) return coords;

  // Center
  let mx = 0,
    my = 0;
  for (const [x, y] of coords) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;
  let cx = coords.map(([x, y]) => [x - mx, y - my] as [number, number]);

  if (n === 1) return [[0, 0]];

  // PCA: covariance matrix
  let cxx = 0,
    cxy = 0,
    cyy = 0;
  for (const [x, y] of cx) {
    cxx += x * x;
    cxy += x * y;
    cyy += y * y;
  }
  cxx /= n;
  cxy /= n;
  cyy /= n;

  // Eigenvalues of 2×2 symmetric
  const trace = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (trace / 2) ** 2 - det));
  const lam1 = trace / 2 + disc;
  // Principal eigenvector
  let ex = 1,
    ey = 0;
  if (Math.abs(cxy) > 1e-12) {
    ex = lam1 - cyy;
    ey = cxy;
    const len = Math.sqrt(ex * ex + ey * ey) || 1;
    ex /= len;
    ey /= len;
  } else if (cyy > cxx) {
    ex = 0;
    ey = 1;
  }

  // Rotate so principal axis is horizontal
  cx = cx.map(
    ([x, y]) => [x * ex + y * ey, -x * ey + y * ex] as [number, number],
  );

  // Reflect so smallest-slug node is in top-left quadrant
  const minSlugIdx = slugs
    .map((s, i) => [s, i] as [string, number])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))[0][1];

  const [refX, refY] = cx[minSlugIdx];
  if (refX > 0) cx = cx.map(([x, y]) => [-x, y] as [number, number]);
  if (refY > 0) cx = cx.map(([x, y]) => [x, -y] as [number, number]);

  // Re-center
  let fx = 0,
    fy = 0;
  for (const [x, y] of cx) {
    fx += x;
    fy += y;
  }
  fx /= n;
  fy /= n;
  return cx.map(([x, y]) => [x - fx, y - fy] as [number, number]);
}

// ---------------------------------------------------------------------------
// Component packing
// ---------------------------------------------------------------------------

/**
 * Pack multiple component bounding boxes into a single canvas.
 * Order: largest component first (tie-break by smallest slug in component).
 * Arrange in a row with gaps, then re-center.
 */
function packComponents(
  componentLayouts: Array<{
    indices: number[];
    coords: Array<[number, number]>;
  }>,
  targetAspect: number,
): Map<number, [number, number]> {
  if (componentLayouts.length === 0) return new Map();

  // Compute bounding boxes
  const boxes = componentLayouts.map(({ coords }) => {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [x, y] of coords) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // Single-node components
    if (!isFinite(minX)) {
      minX = maxX = 0;
      minY = maxY = 0;
    }
    return { w: maxX - minX || 1, h: maxY - minY || 1, minX, minY };
  });

  // Sort by area desc (tie: by smallest slug in component — already sorted at call site)
  const order = componentLayouts
    .map((_, i) => i)
    .sort((a, b) => {
      const areaA = boxes[a].w * boxes[a].h;
      const areaB = boxes[b].w * boxes[b].h;
      return areaB - areaA;
    });

  // Arrange in a row
  const PAD = 40;
  let cursor = 0;
  const offsets: Array<[number, number]> = new Array(componentLayouts.length);
  for (const i of order) {
    offsets[i] = [cursor - boxes[i].minX, -boxes[i].minY];
    cursor += boxes[i].w + PAD;
  }

  // Build final map
  const result = new Map<number, [number, number]>();
  for (let ci = 0; ci < componentLayouts.length; ci++) {
    const [ox, oy] = offsets[ci];
    componentLayouts[ci].indices.forEach((nodeIdx, j) => {
      const [x, y] = componentLayouts[ci].coords[j];
      result.set(nodeIdx, [x + ox, y + oy]);
    });
  }

  // Fit to targetAspect: scale x to match width/height = targetAspect
  const allCoords = [...result.values()];
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of allCoords) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const totalW = maxX - minX || 1;
  const totalH = maxY - minY || 1;
  const currentAspect = totalW / totalH;
  const scaleX =
    currentAspect < targetAspect ? targetAspect / currentAspect : 1;
  const scaleY =
    currentAspect > targetAspect ? currentAspect / targetAspect : 1;

  // Re-center and scale
  const cx2 = (minX + maxX) / 2,
    cy2 = (minY + maxY) / 2;
  for (const [idx, [x, y]] of result) {
    result.set(idx, [(x - cx2) * scaleX, (y - cy2) * scaleY]);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Overlap removal (fixed-iteration push-apart)
// ---------------------------------------------------------------------------

function removeOverlaps(
  coords: Map<number, [number, number]>,
  indices: number[],
  minSep: number,
  iters = 20,
): void {
  // Sort indices deterministically for push order
  const sorted = [...indices].sort((a, b) => a - b);

  for (let iter = 0; iter < iters; iter++) {
    let moved = false;
    for (let ai = 0; ai < sorted.length; ai++) {
      for (let bi = ai + 1; bi < sorted.length; bi++) {
        const a = sorted[ai],
          b = sorted[bi];
        const [ax, ay] = coords.get(a)!;
        const [bx, by] = coords.get(b)!;
        const dx = bx - ax,
          dy = by - ay;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1e-9;
        if (dist < minSep) {
          const push = (minSep - dist) / 2;
          const nx = (dx / dist) * push,
            ny = (dy / dist) * push;
          coords.set(a, [ax - nx, ay - ny]);
          coords.set(b, [bx + nx, by + ny]);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

// ---------------------------------------------------------------------------
// Category cohesion: shrink same-beat distances
// ---------------------------------------------------------------------------

function applyCohesion(
  D: Float64Array[],
  nodes: GraphPerson[],
  indices: number[],
  cohesion: Cohesion,
): void {
  if (cohesion === "none") return;
  const factor = cohesion === "mild" ? 0.85 : 0.6;
  for (let ai = 0; ai < indices.length; ai++) {
    for (let bi = ai + 1; bi < indices.length; bi++) {
      const a = indices[ai],
        b = indices[bi];
      const pA = nodes[a],
        pB = nodes[b];
      if (pA.beat && pB.beat && pA.beat === pB.beat) {
        D[ai][bi] = D[ai][bi] * factor;
        D[bi][ai] = D[bi][ai] * factor;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main global layout
// ---------------------------------------------------------------------------

export function layoutGraph(
  people: GraphPerson[],
  relationships: GraphRelationship[],
  partialOpts: Partial<LayoutOpts> = {},
): NodeCoords {
  const opts: LayoutOpts = { ...DEFAULT_OPTS, ...partialOpts };
  const n = people.length;
  const result: NodeCoords = new Map();
  if (n === 0) return result;

  // Single node
  if (n === 1) {
    result.set(people[0].id, { x: 0, y: 0 });
    return result;
  }

  const adj = buildAdjacency(people, relationships);
  const components = findComponents(adj);

  // Sort components: largest first; tie-break by smallest slug in component
  components.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    const minSlugA = a.map((i) => people[i].slug).sort()[0];
    const minSlugB = b.map((i) => people[i].slug).sort()[0];
    return minSlugA < minSlugB ? -1 : minSlugA > minSlugB ? 1 : 0;
  });

  const componentLayouts: Array<{
    indices: number[];
    coords: Array<[number, number]>;
  }> = [];

  for (const compIndices of components) {
    const m = compIndices.length;

    if (m === 1) {
      componentLayouts.push({ indices: compIndices, coords: [[0, 0]] });
      continue;
    }

    // Build local BFS distance matrix
    // compIndices is the global indices; we work in local coords [0..m-1]
    const localAdj: AdjEntry[][] = compIndices.map(() => []);
    const globalToLocal = new Map(compIndices.map((gi, li) => [gi, li]));
    for (const gi of compIndices) {
      const li = globalToLocal.get(gi)!;
      for (const { neighbor: gj, kind } of adj[gi]) {
        const lj = globalToLocal.get(gj);
        if (lj !== undefined) localAdj[li].push({ neighbor: lj, kind });
      }
    }

    const D: Float64Array[] = Array.from(
      { length: m },
      () => new Float64Array(m),
    );
    for (let li = 0; li < m; li++) {
      const dists = bfsFrom(li, localAdj);
      for (let lj = 0; lj < m; lj++) D[li][lj] = dists[lj];
    }

    // Category cohesion
    const localNodes = compIndices.map((gi) => people[gi]);
    applyCohesion(
      D,
      localNodes,
      Array.from({ length: m }, (_, i) => i),
      opts.cohesion,
    );

    // Classical MDS init
    let coords = classicalMDS(D, m);

    // SMACOF
    coords = smacof(coords, D, m, opts.iters);

    // Deterministic orient
    const slugs = compIndices.map((gi) => people[gi].slug);
    coords = orient(coords, slugs);

    componentLayouts.push({ indices: compIndices, coords });
  }

  // Pack components + fit to aspect
  const packed = packComponents(componentLayouts, opts.targetAspect);

  // Overlap removal across all nodes
  const allIndices = [...packed.keys()];
  removeOverlaps(packed, allIndices, opts.minSeparation);

  // Write results keyed by person id
  for (const [nodeIdx, [x, y]] of packed) {
    result.set(people[nodeIdx].id, { x, y });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Ego layout (live, per-profile)
// ---------------------------------------------------------------------------

export function layoutEgoGraph(
  focalId: PersonId,
  people: GraphPerson[],
  relationships: GraphRelationship[],
  partialOpts: Partial<LayoutOpts> = {},
): NodeCoords {
  const opts: LayoutOpts = { ...DEFAULT_OPTS, ...partialOpts };
  const result: NodeCoords = new Map();

  if (!people.some((p) => p.id === focalId)) return result;

  // BFS from focal node to get hop distances
  const adj = buildAdjacency(people, relationships);
  const idxMap = new Map(people.map((p, i) => [p.id, i]));
  const focalIdx = idxMap.get(focalId)!;

  const hopDist = bfsFrom(focalIdx, adj);

  // Place focal at (0,0)
  result.set(focalId, { x: 0, y: 0 });

  // Group nodes by hop distance (skip unreachable)
  const maxHop = Math.max(...hopDist.filter(isFinite));
  if (!isFinite(maxHop)) return result;

  // Ring radii (each hop = +100 units)
  const RING_RADIUS = 100;

  for (let hop = 1; hop <= maxHop; hop++) {
    const ring = people
      .map((p, i) => ({ p, i }))
      .filter(({ i }) => hopDist[i] === hop)
      .sort((a, b) => (a.p.slug < b.p.slug ? -1 : 1));

    if (ring.length === 0) continue;

    const r = hop * RING_RADIUS;

    // Group ring nodes by shared connections to previous ring (for angle spread)
    // Simple approach: assign angles evenly, grouped by common neighbor slug
    const sharedNeighborKey = (nodeIdx: number): string => {
      const neighbors = adj[nodeIdx]
        .filter(({ neighbor }) => hopDist[neighbor] === hop - 1)
        .map(({ neighbor }) => people[neighbor].slug)
        .sort()
        .join(",");
      return neighbors || "__isolated__";
    };

    // Sort by shared-neighbor group then slug (deterministic)
    ring.sort((a, b) => {
      const ka = sharedNeighborKey(a.i),
        kb = sharedNeighborKey(b.i);
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.p.slug < b.p.slug ? -1 : 1;
    });

    ring.forEach(({ p }, angleIdx) => {
      // Distribute evenly around the ring, starting from -π/2 (top)
      const angle = -Math.PI / 2 + (2 * Math.PI * angleIdx) / ring.length;
      result.set(p.id, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
    });
  }

  // Overlap removal: convert map keys (person ids) to indices for the helper
  const coordMap = new Map<number, [number, number]>();
  for (const [id, { x, y }] of result) {
    const idx = idxMap.get(id);
    if (idx !== undefined) coordMap.set(idx, [x, y]);
  }
  removeOverlaps(coordMap, [...coordMap.keys()], opts.minSeparation);
  for (const [idx, [x, y]] of coordMap) {
    result.set(people[idx].id, { x, y });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Procrustes alignment
// ---------------------------------------------------------------------------

/**
 * Aligns `newCoords` to `referenceCoords` via Procrustes (rotate + reflect +
 * uniform scale + translate) so the picture shifts minimally as the graph grows.
 * Returns the aligned version of newCoords.
 * If reference is empty (first run), returns newCoords unchanged.
 */
export function procrustesAlign(
  newCoords: NodeCoords,
  referenceCoords: NodeCoords,
): NodeCoords {
  // Intersection of known person ids
  const commonIds = [...newCoords.keys()].filter((id) =>
    referenceCoords.has(id),
  );

  if (commonIds.length < 2) {
    // Not enough common points to align; return as-is
    return new Map(newCoords);
  }

  const m = commonIds.length;

  // Build matrices for common nodes
  let mx1 = 0,
    my1 = 0,
    mx2 = 0,
    my2 = 0;
  for (const id of commonIds) {
    const r = referenceCoords.get(id)!;
    const n = newCoords.get(id)!;
    mx1 += r.x;
    my1 += r.y;
    mx2 += n.x;
    my2 += n.y;
  }
  mx1 /= m;
  my1 /= m;
  mx2 /= m;
  my2 /= m;

  // Cross-covariance
  let sxx = 0,
    sxy = 0,
    syx = 0,
    syy = 0;
  let ssNew = 0;
  for (const id of commonIds) {
    const r = referenceCoords.get(id)!;
    const n = newCoords.get(id)!;
    const rx = r.x - mx1,
      ry = r.y - my1;
    const nx = n.x - mx2,
      ny = n.y - my2;
    sxx += rx * nx;
    sxy += rx * ny;
    syx += ry * nx;
    syy += ry * ny;
    ssNew += nx * nx + ny * ny;
  }

  // Optimal rotation angle
  const num = sxx + syy;
  const den = sxy - syx;
  // SVD of 2×2: simplified for 2D rotation
  const H = [
    [sxx, sxy],
    [syx, syy],
  ];
  // det(H) sign determines reflection
  const detH = H[0][0] * H[1][1] - H[0][1] * H[1][0];
  const sign = detH >= 0 ? 1 : -1;

  const cosR = (sxx + syy) / (Math.sqrt(num * num + den * den) || 1);
  const sinR = -(sxy - syx) / (Math.sqrt(num * num + den * den) || 1);

  // Scale: optimal Procrustes scale for 2D rotation + optional reflection
  const scale = ssNew > 0 ? (num * cosR + den * (-sinR * sign)) / ssNew : 1;
  const s = Math.min(Math.max(scale, 0.1), 10); // clamp

  // Apply: translate to center, rotate+scale, translate to reference center
  const aligned: NodeCoords = new Map();
  for (const [id, { x, y }] of newCoords) {
    const nx = x - mx2,
      ny = y - my2;
    const rx = (cosR * nx - sinR * ny * sign) * s + mx1;
    const ry = (sinR * nx + cosR * ny * sign) * s + my1;
    aligned.set(id, { x: rx, y: ry });
  }
  return aligned;
}
