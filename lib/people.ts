/**
 * lib/people.ts
 *
 * Server-side data fetcher for /people/[slug] pages.
 *
 * Queries `person_page_view` for the full person record (biography, life
 * events, relationships, attributions, portrait), then fetches the bio and
 * autobio markdown from R2 in parallel.
 */

import { createClient } from "@/lib/supabase/server";
import { getR2Text } from "@/lib/r2-server";
import { resolveMediaUrl, type MediaAsset } from "@/lib/media";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PersonCategory = "contributor" | "figure" | "royalty";
export type PersonBeat =
  | "music"
  | "drama"
  | "art"
  | "literature"
  | "science"
  | "politics"
  | "foreign"
  | "economics"
  | "direction";

export interface LifeEvent {
  /** UUID — exposed via Sprint 7 view update so admin can edit/delete. */
  id: string;
  event_date: string | null;
  precision: "day" | "month" | "year" | null;
  title: string;
  description: string | null;
  kind: string;
  sources: unknown[];
}

export interface PersonRelationship {
  /** UUID — exposed via Sprint 7 view update so admin can edit/delete. */
  id: string;
  other_person_id: string;
  kind: string;
  label: string | null;
  description: string | null;
  start_year: number | null;
  end_year: number | null;
  sources: unknown[];
}

export interface Attribution {
  installment_date: string;
  section: string;
}

export interface PersonPageData {
  id: string;
  slug: string;
  name: string;
  is_contributor: boolean;
  category: PersonCategory;
  beat: PersonBeat | null;
  birth: number | null;
  death: number | null;
  /** Resolved Cloudflare CDN URL for the portrait (or null). */
  portrait_url: string | null;
  portrait_attribution: string | null;
  sources: unknown[];
  /** Bio markdown fetched from R2 (null if not yet added). */
  bio_md: string | null;
  /** Autobiographical excerpt markdown fetched from R2 (null if not yet added). */
  autobio_md: string | null;
  /** R2 keys — exposed for admin writes. */
  bio_md_r2_key: string | null;
  autobio_md_r2_key: string | null;
  portrait_media_asset_id: string | null;
  life_events: LifeEvent[];
  relationships: PersonRelationship[];
  attributions: Attribution[];
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Fetches and resolves all data for a person's profile page.
 * Returns null if no person with that slug exists.
 */
export async function getPersonPageData(
  slug: string,
): Promise<PersonPageData | null> {
  const supabase = await createClient();

  type PersonViewRow = {
    id: string;
    slug: string;
    name: string;
    is_contributor: boolean;
    category: PersonCategory;
    beat: PersonBeat | null;
    birth: number | null;
    death: number | null;
    sources: unknown[];
    bio_md_r2_key: string | null;
    autobio_md_r2_key: string | null;
    portrait_media_asset_id: string | null;
    portrait_r2_key: string | null;
    portrait_source_url: string | null;
    portrait_attribution: string | null;
    portrait_download_blocked: boolean;
    life_events: LifeEvent[];
    relationships: PersonRelationship[];
    attributions: Attribution[];
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawRow, error } = await (supabase as any)
    .from("person_page_view")
    .select(
      [
        "id",
        "slug",
        "name",
        "is_contributor",
        "category",
        "beat",
        "birth",
        "death",
        "sources",
        "bio_md_r2_key",
        "autobio_md_r2_key",
        "portrait_media_asset_id",
        "portrait_r2_key",
        "portrait_source_url",
        "portrait_attribution",
        "portrait_download_blocked",
        "life_events",
        "relationships",
        "attributions",
      ].join(", "),
    )
    .eq("slug", slug)
    .single();

  if (error || !rawRow) {
    if (error?.code !== "PGRST116") {
      console.error("[people] person_page_view fetch:", error?.message);
    }
    return null;
  }

  const row = rawRow as PersonViewRow;

  // Resolve portrait URL
  let portrait_url: string | null = null;
  if (row.portrait_r2_key) {
    const asset: MediaAsset = {
      id: row.id,
      r2_key: row.portrait_r2_key,
      source_url: row.portrait_source_url,
      download_blocked: row.portrait_download_blocked ?? false,
      download_blocked_reason: null,
    };
    try {
      portrait_url = resolveMediaUrl(asset);
    } catch (err) {
      console.error("[people] portrait resolve:", err);
    }
  }

  // Fetch bio and autobio from R2 in parallel
  const [bio_md, autobio_md] = await Promise.all([
    row.bio_md_r2_key ? getR2Text(row.bio_md_r2_key) : Promise.resolve(null),
    row.autobio_md_r2_key
      ? getR2Text(row.autobio_md_r2_key)
      : Promise.resolve(null),
  ]);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    is_contributor: row.is_contributor ?? false,
    category: row.category ?? "figure",
    beat: row.beat ?? null,
    birth: row.birth ?? null,
    death: row.death ?? null,
    portrait_url,
    portrait_attribution: row.portrait_attribution ?? null,
    sources: row.sources ?? [],
    bio_md: bio_md ?? null,
    autobio_md: autobio_md ?? null,
    bio_md_r2_key: row.bio_md_r2_key ?? null,
    autobio_md_r2_key: row.autobio_md_r2_key ?? null,
    portrait_media_asset_id: row.portrait_media_asset_id ?? null,
    life_events: row.life_events ?? [],
    relationships: row.relationships ?? [],
    attributions: row.attributions ?? [],
  };
}

/**
 * Returns a lightweight list of all people (for nav, graph seeding, etc.).
 * Does not fetch bios or life events — contributors and figures only.
 */
export async function listPeople(): Promise<
  Pick<
    PersonPageData,
    | "id"
    | "slug"
    | "name"
    | "is_contributor"
    | "category"
    | "beat"
    | "birth"
    | "death"
  >[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .select("id, slug, name, is_contributor, category, beat, birth, death")
    .order("name");

  if (error) {
    console.error("[people] listPeople:", error.message);
    return [];
  }

  return (data ?? []) as Pick<
    PersonPageData,
    | "id"
    | "slug"
    | "name"
    | "is_contributor"
    | "category"
    | "beat"
    | "birth"
    | "death"
  >[];
}

// ---------------------------------------------------------------------------
// getPersonAssets — multi-portrait/caricature via asset_links
// ---------------------------------------------------------------------------

export interface PersonAsset {
  id: string;
  r2_key: string | null;
  source_url: string | null;
  title: string | null;
  attribution: string | null;
  license: string | null;
  kind: string;
  sort_order: number;
}

export async function getPersonAssets(
  personId: string,
): Promise<PersonAsset[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("asset_links")
    .select(
      "sort_order, media_assets(id, kind, title, attribution, license, r2_key, source_url, download_blocked)",
    )
    .eq("target_type", "person")
    .eq("target_key", personId)
    .order("sort_order");

  if (error) {
    console.error("[people] getPersonAssets:", error.message);
    return [];
  }

  return (
    (data ?? []) as unknown as Array<{
      sort_order: number;
      media_assets: {
        id: string;
        kind: string;
        title: string | null;
        attribution: string | null;
        license: string | null;
        r2_key: string | null;
        source_url: string | null;
        download_blocked: boolean;
      } | null;
    }>
  )
    .filter((r) => r.media_assets && !r.media_assets.download_blocked)
    .map((r) => ({
      id: r.media_assets!.id,
      r2_key: r.media_assets!.r2_key,
      source_url: r.media_assets!.source_url,
      title: r.media_assets!.title,
      attribution: r.media_assets!.attribution,
      license: r.media_assets!.license,
      kind: r.media_assets!.kind,
      sort_order: r.sort_order,
    }));
}

// ---------------------------------------------------------------------------
// getEgoGraph — focal person + 1-hop subgraph for RelationshipGraph
// ---------------------------------------------------------------------------

import type { GraphPerson, GraphRelationship } from "@/lib/graph-layout";

export async function getEgoGraph(personId: string): Promise<{
  people: GraphPerson[];
  relationships: GraphRelationship[];
} | null> {
  const supabase = await createClient();

  // Get all relationship edges touching this person
  const { data: relRows, error: relErr } = await supabase
    .from("relationships")
    .select("id, from_person, to_person, kind, sources")
    .or(`from_person.eq.${personId},to_person.eq.${personId}`);

  if (relErr) {
    console.error("[people] getEgoGraph rels:", relErr.message);
    return null;
  }

  const edges = relRows ?? [];
  const neighborIds = new Set<string>();
  neighborIds.add(personId);
  for (const r of edges) {
    neighborIds.add(r.from_person);
    neighborIds.add(r.to_person);
  }

  // Fetch all neighbor people rows
  const { data: peopleRows, error: peopleErr } = await supabase
    .from("people")
    .select("id, slug, name, category, beat, is_contributor")
    .in("id", [...neighborIds]);

  if (peopleErr) {
    console.error("[people] getEgoGraph people:", peopleErr.message);
    return null;
  }

  // Also fetch relationships among neighbors (neighbor-to-neighbor edges for graph context)
  const neighborArr = [...neighborIds].filter((id) => id !== personId);
  let interEdges: typeof edges = [];
  if (neighborArr.length > 0) {
    const { data: inter } = await supabase
      .from("relationships")
      .select("id, from_person, to_person, kind, sources")
      .in("from_person", neighborArr)
      .in("to_person", neighborArr);
    interEdges = inter ?? [];
  }

  const allEdges = [
    ...edges,
    ...interEdges.filter((ie) => !edges.some((e) => e.id === ie.id)),
  ];

  const people: GraphPerson[] = (
    (peopleRows ?? []) as Array<{
      id: string;
      slug: string;
      name: string;
      category: string;
      beat: string | null;
      is_contributor: boolean;
    }>
  ).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category as GraphPerson["category"],
    beat: p.beat,
    is_contributor: p.is_contributor,
  }));

  const relationships: GraphRelationship[] = allEdges.map((r) => ({
    from_person: r.from_person,
    to_person: r.to_person,
    kind: r.kind,
    sources: Array.isArray(r.sources) ? r.sources : [],
  }));

  return { people, relationships };
}
