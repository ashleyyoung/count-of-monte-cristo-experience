"use client";

/**
 * components/people/ProfileTabs.tsx
 *
 * 7-tab shell for the contributor profile page.
 * Tabs: Life | In their own words | Portraits | Achievements | Débats writing | Connections | Family
 * Active tab synced to ?tab= URL param.
 */

import React, { useCallback, useMemo, useState } from "react";
import styled from "styled-components";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { PersonPageData, LifeEvent, PersonRelationship } from "@/lib/people";
import type { PortraitAsset } from "./PortraitGallery";
import type { GraphPerson, GraphRelationship } from "@/lib/graph-layout";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import EditableText from "@/components/admin/primitives/EditableText";
import {
  updatePersonBio,
  updatePersonAutobio,
  upsertLifeEvent,
  deleteLifeEvent,
  upsertRelationship,
  deleteRelationship,
} from "@/app/actions/admin";

// Lazy imports for heavy tab content
import dynamic from "next/dynamic";
const LifeTimeline = dynamic(() => import("./LifeTimeline"), { ssr: false });
const PortraitGallery = dynamic(() => import("./PortraitGallery"), { ssr: false });
const RelationshipGraph = dynamic(
  () => import("@/components/graph/RelationshipGraph").then((m) => ({ default: m.RelationshipGraph })),
  { ssr: false },
);

import SourceBlock from "./SourceBlock";
import Cite, { type CiteSource } from "@/components/ui/Cite";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TABS = [
  { id: "life",        label: "Life" },
  { id: "words",       label: "In Their Own Words" },
  { id: "portraits",   label: "Portraits" },
  { id: "achievements",label: "Achievements" },
  { id: "debats",      label: "Their Débats Writing" },
  { id: "connections", label: "Connections" },
  { id: "family",      label: "Family" },
] as const;

type TabId = typeof TABS[number]["id"];

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
`;

const TabBar = styled.nav`
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--rule-mid);
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }

  /* On mobile the tabs wrap into a 2-column grid instead of scrolling
     horizontally. The 1px gap over a rule-light background draws the cell
     separators. */
  @media (max-width: 800px) {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: var(--rule-light);
    border: 1px solid var(--rule-light);
    overflow-x: visible;
  }
`;

const TabBtn = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  padding: 0.65rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? "var(--gilt-warm)" : "transparent")};
  margin-bottom: -2px;
  font-family: var(--font-labels-stack);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: ${({ $active }) => ($active ? "var(--ink-primary)" : "var(--ink-muted)")};
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s;

  &:hover { color: var(--ink-secondary); }

  @media (max-width: 800px) {
    background: var(--paper-base);
    text-align: center;
    white-space: normal;
    margin-bottom: 0;
    padding: 0.6rem 0.5rem;

    /* An odd final tab spans both columns so the grid never has an empty cell. */
    &:last-child:nth-child(odd) {
      grid-column: 1 / -1;
    }
  }
`;

const TabContent = styled.div`
  padding: 2rem 0;
  flex: 1;
`;

const Prose = styled.div`
  font-family: var(--font-body-stack);
  font-size: 1rem;
  line-height: 1.7;
  color: var(--ink-primary);
  max-width: 72ch;

  p { margin: 0 0 1rem; }
  h1 {
    font-family: var(--font-display-stack);
    font-size: 1.5rem;
    font-weight: 400;
    margin: 0 0 1rem;
    line-height: 1.2;
  }
  h2 {
    font-family: var(--font-display-stack);
    font-size: 1.25rem;
    font-weight: 400;
    margin: 1.5rem 0 0.5rem;
    line-height: 1.25;
  }
  h3 { font-family: var(--font-display-stack); font-size: 1.1rem; margin: 1.5rem 0 0.5rem; }
  blockquote {
    margin: 1rem 0 1rem 1.5rem;
    padding-left: 1rem;
    border-left: 3px solid var(--gilt-warm);
    font-style: italic;
    color: var(--ink-secondary);
  }
`;

const AttributionList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const AttributionItem = styled.li`
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--rule-light);
  display: flex;
  align-items: baseline;
  gap: 1rem;
`;

const AttrDate = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 0.72rem;
  color: var(--ink-muted);
  min-width: 6rem;
`;

const AttrSection = styled.span`
  font-family: var(--font-body-stack);
  font-size: 0.875rem;
  color: var(--ink-secondary);
`;

const AttrLink = styled.a`
  font-size: 0.72rem;
  color: var(--gilt-deep);
  text-decoration: none;
  margin-left: auto;
  flex-shrink: 0;
  &:hover { text-decoration: underline; }
`;

const Empty = styled.p`
  color: var(--ink-muted);
  font-style: italic;
  font-size: 0.875rem;
`;

const GraphWrap = styled.div`
  height: 480px;
  border: 1px solid var(--rule-light);
`;

const RelEdgeList = styled.ul`
  list-style: none;
  margin: 1.5rem 0 0;
  padding: 0;
`;

const RelEdgeItem = styled.li`
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--rule-light);
  display: grid;
  grid-template-columns: 10rem 1fr;
  gap: 0.75rem;

  @media (max-width: 480px) {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }
`;

const RelName = styled.a`
  font-family: var(--font-body-stack);
  font-weight: 600;
  color: var(--ink-primary);
  text-decoration: none;
  &:hover { color: var(--gilt-deep); }
`;

const RelKind = styled.span`
  display: inline-block;
  font-size: 0.65rem;
  font-family: var(--font-labels-stack);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--paper-base);
  background: var(--ink-tertiary);
  padding: 0.1rem 0.4rem;
  border-radius: 2px;
  margin-bottom: 0.25rem;
`;

const RelDesc = styled.p`
  margin: 0.25rem 0 0;
  font-size: 0.8rem;
  color: var(--ink-muted);
`;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProfileTabsProps {
  person: PersonPageData;
  portraitAssets: PortraitAsset[];
  egoGraph: { people: GraphPerson[]; relationships: GraphRelationship[] } | null;
  neighborSlugs: Record<string, string>; // person_id → slug
  neighborNames: Record<string, string>; // person_id → name
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfileTabs({
  person,
  portraitAssets,
  egoGraph,
  neighborSlugs,
  neighborNames,
}: ProfileTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { adminMode } = useAdminMode();

  const activeTab: TabId = (searchParams.get("tab") as TabId) ?? "life";

  const setTab = useCallback(
    (id: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const visibleTabs = TABS.filter((t) => {
    if (t.id === "connections") return adminMode;
    // Hide "In Their Own Words" for visitors when there's nothing to show —
    // admins still see it so they can write the first excerpt.
    if (t.id === "words") return adminMode || !!person.autobio_md;
    return true;
  });

  const effectiveTab: TabId =
    activeTab === "connections" && !adminMode
      ? "life"
      : activeTab === "words" && !adminMode && !person.autobio_md
        ? "life"
        : activeTab;

  return (
    <Shell>
      <TabBar role="tablist" aria-label="Profile sections">
        {visibleTabs.map((t) => (
          <TabBtn
            key={t.id}
            role="tab"
            aria-selected={effectiveTab === t.id}
            $active={effectiveTab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </TabBtn>
        ))}
      </TabBar>

      <TabContent role="tabpanel">
        {effectiveTab === "life" && (
          <LifeTab person={person} />
        )}
        {effectiveTab === "words" && (
          <WordsTab person={person} />
        )}
        {effectiveTab === "portraits" && (
          <PortraitsTab assets={portraitAssets} name={person.name} />
        )}
        {effectiveTab === "achievements" && (
          <AchievementsTab person={person} />
        )}
        {effectiveTab === "debats" && (
          <DebatsTab person={person} />
        )}
        {effectiveTab === "connections" && adminMode && (
          <ConnectionsTab person={person} egoGraph={egoGraph} neighborSlugs={neighborSlugs} neighborNames={neighborNames} />
        )}
        {effectiveTab === "family" && (
          <FamilyTab person={person} neighborSlugs={neighborSlugs} neighborNames={neighborNames} />
        )}
      </TabContent>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Individual tab panels
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Admin sub-components (shown only when adminMode is on)
// ---------------------------------------------------------------------------

const AdminPanel = styled.div`
  margin-bottom: 1.5rem;
  padding: 12px 14px;
  background: rgba(201,162,75,0.05);
  border: 1px dashed var(--gilt-warm);
`;

const AdminPanelTitle = styled.h4`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--gilt-deep);
  margin: 0 0 10px;
`;

const AdminRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid rgba(201,162,75,0.12);
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.05em;
  color: var(--ink-secondary);
`;

const AdminRowContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const SmallBtn = styled.button<{ $danger?: boolean }>`
  font-family: var(--font-labels-stack);
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 2px 6px;
  background: ${({ $danger }) => ($danger ? "rgba(180,40,30,0.08)" : "transparent")};
  color: ${({ $danger }) => ($danger ? "var(--oxblood)" : "var(--ink-muted)")};
  border: 1px solid ${({ $danger }) => ($danger ? "rgba(180,40,30,0.25)" : "var(--rule-light)")};
  cursor: pointer;
  line-height: 1.7;
  flex-shrink: 0;
  &:hover { background: ${({ $danger }) => ($danger ? "rgba(180,40,30,0.15)" : "var(--paper-deep)")}; }
`;

const AddBtn = styled.button`
  margin-top: 8px;
  padding: 4px 10px;
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: transparent;
  color: var(--gilt-deep);
  border: 1px dashed var(--gilt-warm);
  cursor: pointer;
  &:hover { background: rgba(201,162,75,0.08); }
`;

function AdminLifeEvents({ person }: { person: PersonPageData }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: "", event_date: "", kind: "work", description: "" });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.kind) { setStatus("Title and kind are required."); return; }
    setSaving(true);
    try {
      await upsertLifeEvent({
        person_id: person.id,
        event_date: form.event_date || null,
        precision: form.event_date ? "day" : null,
        title: form.title,
        description: form.description || null,
        kind: form.kind as "birth" | "death" | "work" | "appointment" | "award" | "publication" | "premiere" | "discovery" | "personal",
        sources: [],
      });
      router.refresh();
      setAdding(false);
      setForm({ title: "", event_date: "", kind: "work", description: "" });
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await deleteLifeEvent(id);
      router.refresh();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <AdminPanel>
      <AdminPanelTitle>⬛ Life events — admin</AdminPanelTitle>
      {person.life_events.map((ev) => (
        <AdminRow key={ev.id}>
          <AdminRowContent>
            <strong>{ev.event_date?.slice(0, 4) ?? "–"}</strong> {ev.title}
            {" "}<span style={{ opacity: 0.6 }}>({ev.kind})</span>
          </AdminRowContent>
          <SmallBtn $danger onClick={() => handleDelete(ev.id, ev.title)}>Delete</SmallBtn>
        </AdminRow>
      ))}

      {adding ? (
        <form onSubmit={handleAdd} style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            style={{ padding: "4px 6px", fontFamily: "var(--font-body-stack)", fontSize: "0.82rem", border: "1px solid var(--rule-light)", background: "var(--paper-base)", color: "var(--ink-primary)" }}
            placeholder="Title *"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <input
            style={{ padding: "4px 6px", fontFamily: "var(--font-labels-stack)", fontSize: "0.82rem", border: "1px solid var(--rule-light)", background: "var(--paper-base)", color: "var(--ink-primary)" }}
            placeholder="Date (YYYY-MM-DD)"
            value={form.event_date}
            onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
          />
          <select
            style={{ padding: "4px 6px", fontFamily: "var(--font-labels-stack)", fontSize: "0.82rem", border: "1px solid var(--rule-light)", background: "var(--paper-base)", color: "var(--ink-primary)" }}
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
          >
            {["birth","death","work","appointment","award","publication","premiere","discovery","personal"].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <input
            style={{ padding: "4px 6px", fontFamily: "var(--font-body-stack)", fontSize: "0.82rem", border: "1px solid var(--rule-light)", background: "var(--paper-base)", color: "var(--ink-primary)" }}
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <SmallBtn type="submit" disabled={saving}>{saving ? "Saving…" : "Add"}</SmallBtn>
            <SmallBtn type="button" onClick={() => setAdding(false)}>Cancel</SmallBtn>
            {status && <span style={{ fontFamily: "var(--font-labels-stack)", fontSize: 9, color: "var(--ink-muted)" }}>{status}</span>}
          </div>
        </form>
      ) : (
        <AddBtn onClick={() => setAdding(true)}>⊕ Add life event</AddBtn>
      )}
    </AdminPanel>
  );
}

function AdminRelationships({ person }: { person: PersonPageData; neighborNames: Record<string, string> }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ to_person: "", kind: "friend", label: "", start_year: "", end_year: "" });
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.to_person || !form.kind) { setStatus("Target person ID and kind are required."); return; }
    setSaving(true);
    try {
      await upsertRelationship({
        from_person: person.id,
        to_person: form.to_person,
        kind: form.kind as "family" | "romantic" | "friend" | "rival" | "mentor" | "collaborator" | "patron" | "royalty" | "professional",
        label: form.label || null,
        description: null,
        start_year: form.start_year ? parseInt(form.start_year, 10) : null,
        end_year: form.end_year ? parseInt(form.end_year, 10) : null,
        sources: [],
      });
      router.refresh();
      setAdding(false);
      setForm({ to_person: "", kind: "friend", label: "", start_year: "", end_year: "" });
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this relationship?")) return;
    try {
      await deleteRelationship(id);
      router.refresh();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <AdminPanel style={{ marginTop: 12 }}>
      <AdminPanelTitle>⬛ Relationships — admin</AdminPanelTitle>
      {person.relationships.map((rel) => (
        <AdminRow key={rel.id}>
          <AdminRowContent>
            <strong>{rel.kind}</strong> → {rel.other_person_id.slice(0, 8)}…
            {rel.label && <span style={{ opacity: 0.7 }}> — {rel.label}</span>}
          </AdminRowContent>
          <SmallBtn $danger onClick={() => handleDelete(rel.id)}>Delete</SmallBtn>
        </AdminRow>
      ))}
      {adding ? (
        <form onSubmit={handleAdd} style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            style={{ padding: "4px 6px", fontFamily: "var(--font-labels-stack)", fontSize: "0.82rem", border: "1px solid var(--rule-light)", background: "var(--paper-base)", color: "var(--ink-primary)" }}
            placeholder="Target person UUID *"
            value={form.to_person}
            onChange={(e) => setForm((f) => ({ ...f, to_person: e.target.value }))}
          />
          <select
            style={{ padding: "4px 6px", fontFamily: "var(--font-labels-stack)", fontSize: "0.82rem", border: "1px solid var(--rule-light)", background: "var(--paper-base)", color: "var(--ink-primary)" }}
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}
          >
            {["family","romantic","friend","rival","mentor","collaborator","patron","royalty","professional"].map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          <input
            style={{ padding: "4px 6px", fontFamily: "var(--font-labels-stack)", fontSize: "0.82rem", border: "1px solid var(--rule-light)", background: "var(--paper-base)", color: "var(--ink-primary)" }}
            placeholder="Label (optional)"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ padding: "4px 6px", width: 80, fontFamily: "var(--font-labels-stack)", fontSize: "0.82rem", border: "1px solid var(--rule-light)", background: "var(--paper-base)", color: "var(--ink-primary)" }}
              placeholder="From year"
              type="number"
              value={form.start_year}
              onChange={(e) => setForm((f) => ({ ...f, start_year: e.target.value }))}
            />
            <input
              style={{ padding: "4px 6px", width: 80, fontFamily: "var(--font-labels-stack)", fontSize: "0.82rem", border: "1px solid var(--rule-light)", background: "var(--paper-base)", color: "var(--ink-primary)" }}
              placeholder="To year"
              type="number"
              value={form.end_year}
              onChange={(e) => setForm((f) => ({ ...f, end_year: e.target.value }))}
            />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <SmallBtn type="submit" disabled={saving}>{saving ? "Saving…" : "Add"}</SmallBtn>
            <SmallBtn type="button" onClick={() => setAdding(false)}>Cancel</SmallBtn>
            {status && <span style={{ fontFamily: "var(--font-labels-stack)", fontSize: 9, color: "var(--ink-muted)" }}>{status}</span>}
          </div>
        </form>
      ) : (
        <AddBtn onClick={() => setAdding(true)}>⊕ Add relationship</AddBtn>
      )}
    </AdminPanel>
  );
}

function LifeTab({ person }: { person: PersonPageData }) {
  const { adminMode } = useAdminMode();
  const router = useRouter();

  const handleBioSave = useCallback(async (newBio: string) => {
    await updatePersonBio(person.id, person.slug, newBio);
    router.refresh();
  }, [person.id, person.slug, router]);

  return (
    <div>
      <LifeTimeline
        name={person.name}
        birth={person.birth}
        death={person.death}
        events={person.life_events}
      />
      {adminMode && <AdminLifeEvents person={person} />}
      <Prose>
        <EditableText
          value={person.bio_md ?? ""}
          onSave={handleBioSave}
          placeholder="Write biography in markdown…"
        >
          {person.bio_md ? (
            <MarkdownRender md={person.bio_md} />
          ) : (
            <Empty>Biography not yet available.</Empty>
          )}
        </EditableText>
      </Prose>
      <SourceBlock sources={person.sources} />
    </div>
  );
}

function WordsTab({ person }: { person: PersonPageData }) {
  const { adminMode } = useAdminMode();
  const router = useRouter();

  const handleAutobioSave = useCallback(async (newText: string) => {
    await updatePersonAutobio(person.id, person.slug, newText);
    router.refresh();
  }, [person.id, person.slug, router]);

  return (
    <div>
      <Prose>
        <EditableText
          value={person.autobio_md ?? ""}
          onSave={handleAutobioSave}
          placeholder="Write autobiographical excerpts in markdown…"
        >
          {person.autobio_md ? (
            <MarkdownRender md={person.autobio_md} />
          ) : (
            <Empty>Autobiographical excerpts not yet available for {person.name}.</Empty>
          )}
        </EditableText>
      </Prose>
      <SourceBlock sources={person.sources} label="Text sources" />
    </div>
  );
}

function PortraitsTab({ assets, name }: { assets: PortraitAsset[]; name: string }) {
  return <PortraitGallery assets={assets} name={name} />;
}

function AchievementsTab({ person }: { person: PersonPageData }) {
  const achievementEvents = person.life_events.filter((e) =>
    ["work", "publication", "discovery", "award", "premiere", "appointment"].includes(e.kind),
  );
  return (
    <div>
      {achievementEvents.length > 0 ? (
        <AttributionList>
          {achievementEvents
            .sort((a, b) => (a.event_date ?? "") < (b.event_date ?? "") ? -1 : 1)
            .map((ev, i) => {
              const src = Array.isArray(ev.sources) && ev.sources.length > 0
                ? (ev.sources[0] as Record<string,string>)
                : null;
              return (
                <AttributionItem key={i}>
                  <AttrDate>{ev.event_date?.slice(0, 4) ?? "–"}</AttrDate>
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontFamily: "var(--font-body-stack)", fontSize: "0.9rem" }}>
                      {ev.title}
                    </strong>
                    {ev.description && (
                      <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                        {ev.description}
                      </p>
                    )}
                    {src?.url && (
                      <AttrLink href={src.url} target="_blank" rel="noopener noreferrer">
                        Source ↗
                      </AttrLink>
                    )}
                  </div>
                </AttributionItem>
              );
            })}
        </AttributionList>
      ) : (
        <Empty>Achievements not yet catalogued for {person.name}.</Empty>
      )}
      <SourceBlock sources={person.sources} />
    </div>
  );
}

function DebatsTab({ person }: { person: PersonPageData }) {
  const sorted = [...person.attributions].sort((a, b) =>
    a.installment_date < b.installment_date ? -1 : 1,
  );
  return (
    <div>
      {sorted.length > 0 ? (
        <AttributionList>
          {sorted.map((attr, i) => (
            <AttributionItem key={i}>
              <AttrDate>{attr.installment_date}</AttrDate>
              <AttrSection style={{ textTransform: "capitalize" }}>
                {attr.section.replace(/_/g, " ")}
              </AttrSection>
              <AttrLink href={`/day/${attr.installment_date}?tab=${attr.section}`}>
                Read →
              </AttrLink>
            </AttributionItem>
          ))}
        </AttributionList>
      ) : (
        <Empty>No Débats writing records yet for {person.name}.</Empty>
      )}
    </div>
  );
}

function ConnectionsTab({
  person,
  egoGraph,
  neighborSlugs,
  neighborNames,
}: {
  person: PersonPageData;
  egoGraph: { people: GraphPerson[]; relationships: GraphRelationship[] } | null;
  neighborSlugs: Record<string, string>;
  neighborNames: Record<string, string>;
}) {
  const { adminMode } = useAdminMode();
  const focalPerson: GraphPerson | undefined = egoGraph?.people.find(
    (p) => p.id === person.id,
  );

  return (
    <div>
      {adminMode && <AdminRelationships person={person} neighborNames={neighborNames} />}
      {egoGraph && focalPerson ? (
        <GraphWrap>
          <RelationshipGraph
            focalPerson={focalPerson}
            people={egoGraph.people}
            relationships={egoGraph.relationships}
          />
        </GraphWrap>
      ) : (
        <Empty>No connections recorded yet for {person.name}.</Empty>
      )}

      {/* Edge list with source links */}
      {person.relationships.length > 0 && (
        <RelEdgeList>
          {person.relationships.map((rel, i) => {
            const otherSlug = neighborSlugs[rel.other_person_id];
            const otherName = neighborNames[rel.other_person_id] ?? "Unknown";
            return (
              <RelEdgeItem key={i}>
                <div>
                  <RelKind>{rel.kind}</RelKind>
                  <br />
                  {otherSlug ? (
                    <RelName href={`/people/${otherSlug}`}>{otherName}</RelName>
                  ) : (
                    <span style={{ fontFamily: "var(--font-body-stack)", fontSize: "0.9rem" }}>
                      {otherName}
                    </span>
                  )}
                  {(rel.start_year || rel.end_year) && (
                    <p style={{ margin: "0.1rem 0 0", fontSize: "0.7rem", color: "var(--ink-muted)" }}>
                      {rel.start_year ?? "?"}–{rel.end_year ?? "present"}
                    </p>
                  )}
                </div>
                <div>
                  {rel.label && (
                    <p style={{ margin: 0, fontStyle: "italic", fontSize: "0.85rem" }}>{rel.label}</p>
                  )}
                  {rel.description && <RelDesc>{rel.description}</RelDesc>}
                  <SourceBlock sources={rel.sources} label="Edge source" />
                </div>
              </RelEdgeItem>
            );
          })}
        </RelEdgeList>
      )}
    </div>
  );
}

function FamilyTab({
  person,
  neighborSlugs,
  neighborNames,
}: {
  person: PersonPageData;
  neighborSlugs: Record<string, string>;
  neighborNames: Record<string, string>;
}) {
  const familyRels = person.relationships.filter(
    (r) => r.kind === "family",
  );

  return (
    <div>
      {familyRels.length > 0 ? (
        <RelEdgeList>
          {familyRels.map((rel, i) => {
            const otherSlug = neighborSlugs[rel.other_person_id];
            const otherName = neighborNames[rel.other_person_id] ?? "Unknown";
            return (
              <RelEdgeItem key={i}>
                <div>
                  <RelKind>family</RelKind>
                  <br />
                  {otherSlug ? (
                    <RelName href={`/people/${otherSlug}`}>{otherName}</RelName>
                  ) : (
                    <span style={{ fontFamily: "var(--font-body-stack)" }}>{otherName}</span>
                  )}
                </div>
                <div>
                  {rel.label && <p style={{ margin: 0, fontStyle: "italic" }}>{rel.label}</p>}
                  {rel.description && <RelDesc>{rel.description}</RelDesc>}
                  <SourceBlock sources={rel.sources} label="Source" />
                </div>
              </RelEdgeItem>
            );
          })}
        </RelEdgeList>
      ) : (
        <Empty>Family data not yet available for {person.name}.</Empty>
      )}
      <SourceBlock sources={person.sources} label="Genealogy sources" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown renderer with footnote → <Cite> support.
//
// Syntax (stored in R2 bio/autobio markdown):
//   Body text with a footnote marker[^1] inline.
//   ...
//   [^1]: Title | Attribution | license=Public Domain | url=https://... | translator=...
//
// Fields after the title are key=value pairs separated by " | ".
// The "url" field maps to reference_url (rendered as a generic "View source"
// link); "source_text_url" maps to the French-original link; "translator" maps
// to translator. Any field not recognised is ignored gracefully.
// ---------------------------------------------------------------------------

/**
 * Parses the footnote definition block at the bottom of a markdown string.
 * Returns a map from footnote number → CiteSource.
 */
function parseFootnotes(md: string): Map<number, CiteSource> {
  const map = new Map<number, CiteSource>();
  const defRegex = /^\[\^(\d+)\]:\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = defRegex.exec(md)) !== null) {
    const num = parseInt(match[1], 10);
    const raw = match[2].trim();
    const parts = raw.split(/\s*\|\s*/);
    const title = parts[0] ?? "";
    const attribution = parts[1] ?? "";
    const source: CiteSource = { title, attribution };
    for (let i = 2; i < parts.length; i++) {
      const kv = parts[i].match(/^(\w+)=(.+)$/);
      if (!kv) continue;
      const key = kv[1];
      const val = kv[2];
      if (key === "license") source.license = val;
      else if (key === "url") source.reference_url = val;
      else if (key === "source_text_url") source.source_text_url = val;
      else if (key === "translator") source.translator = val;
      else if (key === "translation_source_url") source.translation_source_url = val;
    }
    map.set(num, source);
  }
  return map;
}

/** Strips footnote definition lines from the markdown body before rendering. */
function stripFootnoteDefs(md: string): string {
  return md.replace(/^\[\^\d+\]:.+$/gm, "").trimEnd();
}

function MarkdownRender({ md }: { md: string }) {
  const footnotes = useMemo(() => parseFootnotes(md), [md]);
  const body = useMemo(() => stripFootnoteDefs(md), [md]);

  const lines = body.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("### ")) {
      elements.push(<h3 key={i}>{inlineRender(line.slice(4), footnotes)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i}>{inlineRender(line.slice(3), footnotes)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={i}>{inlineRender(line.slice(2), footnotes)}</h1>);
    } else if (line.startsWith("> ")) {
      elements.push(<blockquote key={i}>{inlineRender(line.slice(2), footnotes)}</blockquote>);
    } else if (line.trim() === "") {
      // skip blank lines
    } else {
      elements.push(<p key={i}>{inlineRender(line, footnotes)}</p>);
    }
    i++;
  }

  return <>{elements}</>;
}

function inlineRender(text: string, footnotes?: Map<number, CiteSource>): React.ReactNode {
  // Match bold, italic, links, and footnote markers [^n]
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|\[\^\d+\])/g);
  return parts.map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={j}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={j}>{part.slice(1, -1)}</em>;
    }
    const fnMatch = part.match(/^\[\^(\d+)\]$/);
    if (fnMatch && footnotes) {
      const num = parseInt(fnMatch[1], 10);
      const src = footnotes.get(num);
      if (src) {
        return <Cite key={j} n={num} source={src} />;
      }
      return <sup key={j}>[{num}]</sup>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={j} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
          style={{ color: "var(--gilt-deep)", textDecoration: "none", borderBottom: "1px dotted var(--gilt-deep)" }}>
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}
