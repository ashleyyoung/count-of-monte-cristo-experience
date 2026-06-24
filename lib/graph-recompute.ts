/**
 * lib/graph-recompute.ts
 *
 * recomputeGraphLayout() — server-side function that:
 *  1. Loads all people + relationships from Supabase.
 *  2. Loads all registered graph_variants.
 *  3. For each variant, computes layout via layoutGraph().
 *  4. Procrustes-aligns new layout against previously persisted coords.
 *  5. Upserts result into graph_layout keyed by (variant_slug, person_id).
 *
 * Intended call sites:
 *  - Sprint 5: once after initial people/relationships seed.
 *  - Sprint 6: after any admin write to people or relationships.
 */

import { createAdminClient, createClient } from "@/lib/supabase/server";
import {
  layoutGraph,
  procrustesAlign,
  type GraphPerson,
  type GraphRelationship,
  type LayoutOpts,
  type NodeCoords,
  DEFAULT_OPTS,
} from "@/lib/graph-layout";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphVariantRow {
  key: string;
  label: string;
  params: Record<string, unknown>;
  published: boolean;
  is_default: boolean;
  sort: number;
}

interface GraphLayoutRow {
  variant: string;
  person_id: string;
  x: number;
  y: number;
}

interface PersonRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  beat: string | null;
  is_contributor: boolean;
}

interface RelationshipRow {
  from_person: string;
  to_person: string;
  kind: string;
  sources: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToGraphPerson(r: PersonRow): GraphPerson {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: (r.category as GraphPerson["category"]) ?? "figure",
    beat: r.beat,
    is_contributor: r.is_contributor,
  };
}

function parseVariantOpts(params: Record<string, unknown>): Partial<LayoutOpts> {
  const opts: Partial<LayoutOpts> = {};
  if (params.cohesion === "none" || params.cohesion === "mild" || params.cohesion === "strong") {
    opts.cohesion = params.cohesion;
  }
  if (typeof params.iters === "number") opts.iters = params.iters;
  if (typeof params.targetAspect === "number") opts.targetAspect = params.targetAspect;
  if (typeof params.minSeparation === "number") opts.minSeparation = params.minSeparation;
  return opts;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function recomputeGraphLayout(): Promise<{ variant: string; nodeCount: number }[]> {
  const db = createAdminClient();

  // 1. Load people
  const { data: peopleRows, error: peopleErr } = await db
    .from("people")
    .select("id, slug, name, category, beat, is_contributor");
  if (peopleErr) throw new Error(`Failed to load people: ${peopleErr.message}`);

  const people: GraphPerson[] = ((peopleRows ?? []) as PersonRow[]).map(rowToGraphPerson);

  // 2. Load relationships
  const { data: relRows, error: relErr } = await db
    .from("relationships")
    .select("from_person, to_person, kind, sources");
  if (relErr) throw new Error(`Failed to load relationships: ${relErr.message}`);

  const relationships: GraphRelationship[] = ((relRows ?? []) as RelationshipRow[]).map((r) => ({
    from_person: r.from_person,
    to_person: r.to_person,
    kind: r.kind,
    sources: Array.isArray(r.sources) ? r.sources : [],
  }));

  // 3. Load variants
  const { data: variantRows, error: varErr } = await db
    .from("graph_variants")
    .select("key, label, params, published, is_default, sort")
    .order("sort", { ascending: true });
  if (varErr) throw new Error(`Failed to load graph_variants: ${varErr.message}`);

  const variants = (variantRows ?? []) as GraphVariantRow[];

  const results: { variant: string; nodeCount: number }[] = [];

  for (const variant of variants) {
    const opts = { ...DEFAULT_OPTS, ...parseVariantOpts(variant.params) };

    // 4. Load previously persisted coords for this variant (for Procrustes alignment)
    const { data: prevRows } = await db
      .from("graph_layout")
      .select("person_id, x, y")
      .eq("variant", variant.key);

    const prevCoords: NodeCoords = new Map(
      ((prevRows ?? []) as { person_id: string; x: number; y: number }[]).map((r) => [
        r.person_id,
        { x: r.x, y: r.y },
      ]),
    );

    // 5. Compute layout
    const newCoords = layoutGraph(people, relationships, opts);

    // 6. Procrustes align (skip on first run when prevCoords is empty)
    const aligned = prevCoords.size >= 2
      ? procrustesAlign(newCoords, prevCoords)
      : newCoords;

    // 7. Upsert into graph_layout
    const upsertRows: GraphLayoutRow[] = [];
    for (const [personId, { x, y }] of aligned) {
      upsertRows.push({ variant: variant.key, person_id: personId, x, y });
    }

    if (upsertRows.length > 0) {
      const { error: upsertErr } = await db
        .from("graph_layout")
        .upsert(upsertRows, { onConflict: "variant,person_id" });
      if (upsertErr) throw new Error(`Failed to upsert graph_layout for variant "${variant.key}": ${upsertErr.message}`);
    }

    results.push({ variant: variant.key, nodeCount: upsertRows.length });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Fetch persisted layout for a specific variant (for NetworkGraph)
// ---------------------------------------------------------------------------

export async function fetchGraphLayout(variantKey: string): Promise<NodeCoords> {
  const db = await createClient();
  const { data, error } = await db
    .from("graph_layout")
    .select("person_id, x, y")
    .eq("variant", variantKey);
  if (error) throw new Error(`Failed to fetch graph_layout: ${error.message}`);

  return new Map(
    ((data ?? []) as { person_id: string; x: number; y: number }[]).map((r) => [
      r.person_id,
      { x: r.x, y: r.y },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Resolve which variant to display publicly (default → lowest-sort published → lowest-sort overall)
// ---------------------------------------------------------------------------

export async function resolveDefaultVariant(): Promise<GraphVariantRow | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("graph_variants")
    .select("key, label, params, published, is_default, sort")
    .order("sort", { ascending: true });
  if (error || !data || data.length === 0) return null;

  const rows = data as GraphVariantRow[];

  // 1. is_default + published
  const defaultPublished = rows.find((r) => r.is_default && r.published);
  if (defaultPublished) return defaultPublished;

  // 2. Lowest-sort published
  const lowestPublished = rows.find((r) => r.published);
  if (lowestPublished) return lowestPublished;

  // 3. Lowest-sort overall
  return rows[0];
}

export async function fetchPublishedVariants(): Promise<GraphVariantRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("graph_variants")
    .select("key, label, params, published, is_default, sort")
    .eq("published", true)
    .order("sort", { ascending: true });
  if (error) return [];
  return (data ?? []) as GraphVariantRow[];
}

export async function fetchAllVariants(): Promise<GraphVariantRow[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("graph_variants")
    .select("key, label, params, published, is_default, sort")
    .order("sort", { ascending: true });
  if (error) return [];
  return (data ?? []) as GraphVariantRow[];
}
