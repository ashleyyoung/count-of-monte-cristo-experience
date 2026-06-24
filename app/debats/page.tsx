import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  fetchGraphLayout,
  fetchPublishedVariants,
  resolveDefaultVariant,
} from "@/lib/graph-recompute";
import { listPeople } from "@/lib/people";
import { resolveMediaUrl } from "@/lib/media";
import type { GraphPerson, GraphRelationship } from "@/lib/graph-layout";
import type { PersistedCoord } from "@/components/graph/NetworkGraph";
import type { VignettePerson } from "@/components/debats/VignetteGrid";
import type { TimelinePerson } from "@/components/debats/StackedTimelines";
import DebatsPageView from "@/components/debats/DebatsPageView";

export const metadata = {
  title: "Journal des Débats · Monte Cristo Experience",
  description: "Explore the writers, critics, and scientists who shaped the Journal des Débats during the 1844–46 serialization of The Count of Monte Cristo.",
};

export default async function DebatsPage() {
  const supabase = await createClient();

  // Fetch people for graph
  const [peopleList, variantRow, publishedVariants] = await Promise.all([
    listPeople(),
    resolveDefaultVariant(),
    fetchPublishedVariants(),
  ]);

  // Fetch relationships
  const { data: relRows } = await supabase
    .from("relationships")
    .select("id, from_person, to_person, kind, sources");

  const people: GraphPerson[] = peopleList.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    category: p.category as GraphPerson["category"],
    beat: p.beat ?? null,
    is_contributor: p.is_contributor,
  }));

  const relationships: GraphRelationship[] = (relRows ?? []).map((r) => ({
    from_person: r.from_person,
    to_person: r.to_person,
    kind: r.kind,
    sources: Array.isArray(r.sources) ? r.sources : [],
  }));

  // Fetch persisted coords for the default variant
  const defaultKey = variantRow?.key ?? "structural";
  const nodeCoords = await fetchGraphLayout(defaultKey);

  // Convert Map<PersonId, {x,y}> → PersistedCoord[]
  const coords: PersistedCoord[] = [...nodeCoords.entries()].map(([person_id, { x, y }]) => ({
    person_id,
    x,
    y,
  }));

  // Fetch portrait URLs for vignette grid
  const portraitAssets = await (async () => {
    const { data } = await supabase
      .from("people")
      .select("id, portrait_media_asset_id");
    if (!data) return {} as Record<string, string | null>;
    const assetIds = data.map((p) => p.portrait_media_asset_id).filter(Boolean);
    const { data: assets } = await supabase
      .from("media_assets")
      .select("id, r2_key, source_url, download_blocked")
      .in("id", assetIds);
    const assetMap = new Map((assets ?? []).map((a) => [
      a.id,
      resolveMediaUrl({ id: a.id, r2_key: a.r2_key, source_url: a.source_url, download_blocked: a.download_blocked, download_blocked_reason: null }),
    ]));
    const out: Record<string, string | null> = {};
    for (const p of data) {
      out[p.id] = p.portrait_media_asset_id ? (assetMap.get(p.portrait_media_asset_id) ?? null) : null;
    }
    return out;
  })();

  // Fetch life_events for timeline tracks
  const { data: lifeEventRows } = await supabase
    .from("life_events")
    .select("person_id, event_date, precision, title, description, kind, sources");

  const lifeEventsByPerson: Record<string, typeof lifeEventRows> = {};
  for (const ev of lifeEventRows ?? []) {
    if (!lifeEventsByPerson[ev.person_id]) lifeEventsByPerson[ev.person_id] = [];
    lifeEventsByPerson[ev.person_id]!.push(ev);
  }

  // Build view-specific people arrays
  const vignettePeople: VignettePerson[] = peopleList.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    is_contributor: p.is_contributor,
    category: p.category,
    beat: p.beat ?? null,
    birth: p.birth ?? null,
    death: p.death ?? null,
    portrait_url: portraitAssets[p.id] ?? null,
  }));

  const timelinePeople: TimelinePerson[] = peopleList
    .filter((p) => p.birth != null)
    .map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      is_contributor: p.is_contributor,
      birth: p.birth ?? null,
      death: p.death ?? null,
      beat: p.beat ?? null,
      life_events: (lifeEventsByPerson[p.id] ?? []).map((ev) => ({
        id: (ev as Record<string, unknown>).id as string ?? "",
        event_date: ev.event_date,
        precision: ev.precision as "day" | "month" | "year" | null,
        title: ev.title,
        description: ev.description,
        kind: ev.kind,
        sources: Array.isArray(ev.sources) ? ev.sources : [],
      })),
    }));

  // Build variants list for switcher (use published; fall back to all if none published)
  const allVariants = publishedVariants.length > 0
    ? publishedVariants
    : (variantRow ? [variantRow] : []);

  return (
    <Suspense fallback={null}>
      <DebatsPageView
        people={people}
        relationships={relationships}
        coords={coords}
        variants={allVariants}
        defaultVariantKey={defaultKey}
        vignettePeople={vignettePeople}
        timelinePeople={timelinePeople}
      />
    </Suspense>
  );
}
