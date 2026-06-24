"use client";

/**
 * components/debats/DebatsPageView.tsx
 *
 * Client shell for the Journal des Débats hub page.
 * 3 tabs: The Paper | Connections | People & Lives
 */

import React, { useCallback, useState } from "react";
import styled from "styled-components";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { GraphPerson, GraphRelationship } from "@/lib/graph-layout";
import type { PersistedCoord } from "@/components/graph/NetworkGraph";
import type { GraphVariantRow } from "@/lib/graph-recompute";
import type { VignettePerson } from "./VignetteGrid";
import type { TimelinePerson } from "./StackedTimelines";
import type { VariantOption } from "@/components/graph/VariantSwitcher";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import { triggerGraphRecompute } from "@/app/actions/admin";

const PaperProfile = dynamic(() => import("./PaperProfile"), { ssr: false });
const PressRoom = dynamic(() => import("./PressRoom"), { ssr: false });
const PressBusiness = dynamic(() => import("./PressBusiness"), { ssr: false });
const VignetteGrid = dynamic(() => import("./VignetteGrid"), { ssr: false });
const StackedTimelines = dynamic(() => import("./StackedTimelines"), { ssr: false });
const NetworkGraph = dynamic(
  () => import("@/components/graph/NetworkGraph").then((m) => ({ default: m.NetworkGraph })),
  { ssr: false },
);
const VariantSwitcher = dynamic(
  () => import("@/components/graph/VariantSwitcher").then((m) => ({ default: m.VariantSwitcher })),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DebatsPageViewProps {
  people: GraphPerson[];
  relationships: GraphRelationship[];
  coords: PersistedCoord[];
  variants: GraphVariantRow[];
  defaultVariantKey: string;
  vignettePeople: VignettePerson[];
  timelinePeople: TimelinePerson[];
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
  { id: "paper",       label: "The Paper" },
  { id: "press",       label: "The Press Room" },
  { id: "business",    label: "The Business" },
  { id: "connections", label: "Connections" },
  { id: "people",      label: "People & Lives" },
] as const;

type TabId = typeof TABS[number]["id"];

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Page = styled.div`
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 32px 64px;
  @media (max-width: 700px) { padding: 0 16px 40px; }
`;

const Masthead = styled.header`
  padding: 2rem 0 0;
  margin-bottom: 2rem;
  border-bottom: 2px solid var(--rule-mid);
`;

const Breadcrumb = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
  margin-bottom: 0.75rem;

  a {
    color: var(--ink-muted);
    text-decoration: none;
    &:hover { color: var(--ink-primary); }
  }

  span { color: var(--rule-mid); }
`;

const Title = styled.h1`
  font-family: var(--font-masthead-stack);
  font-size: clamp(1.4rem, 4vw, 2.2rem);
  font-weight: 400;
  color: var(--ink-primary);
  margin: 0 0 0.3rem;
  letter-spacing: 0.01em;
`;

const Subtitle = styled.p`
  font-family: var(--font-labels-stack);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-muted);
  margin: 0 0 1.5rem;
`;

const TabBar = styled.nav`
  display: flex;
  gap: 0;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
`;

const TabBtn = styled.button<{ $active: boolean }>`
  flex-shrink: 0;
  padding: 0.65rem 1.25rem;
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
`;

const TabContent = styled.div`
  padding: 2.5rem 0;
`;

const GraphShell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const GraphCanvas = styled.div`
  width: 100%;
  height: 520px;
  border: 1px solid var(--rule-light);
`;

const PeopleToggle = styled.div`
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const SubBtn = styled.button<{ $active: boolean }>`
  font-family: var(--font-labels-stack);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.35rem 0.9rem;
  border: 1px solid ${({ $active }) => ($active ? "var(--gilt-warm)" : "var(--rule-mid)")};
  background: ${({ $active }) => ($active ? "rgba(201,162,75,0.1)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--gilt-deep)" : "var(--ink-muted)")};
  cursor: pointer;
  transition: all 0.12s;
  &:hover { border-color: var(--gilt-warm); color: var(--gilt-deep); }
`;

const AdminBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  margin-bottom: 12px;
  border-bottom: 1px dashed var(--gilt-warm);
`;

const AdminBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 10px;
  background: transparent;
  color: var(--gilt-deep);
  border: 1px solid var(--gilt-warm);
  cursor: pointer;
  line-height: 1.7;
  &:hover { background: rgba(201,162,75,0.1); }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const AdminNote = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DebatsPageView({
  people,
  relationships,
  coords,
  variants,
  defaultVariantKey,
  vignettePeople,
  timelinePeople,
}: DebatsPageViewProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab: TabId = (searchParams.get("tab") as TabId) ?? "paper";

  const [activeVariantKey, setActiveVariantKey] = useState(defaultVariantKey);
  const [peopleSubview, setPeopleSubview] = useState<"grid" | "timelines">("grid");
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);

  const { adminMode } = useAdminMode();

  async function handleRecompute() {
    setRecomputing(true);
    setRecomputeMsg(null);
    try {
      const result = await triggerGraphRecompute();
      setRecomputeMsg(`Recomputed ${result.variants} variant${result.variants !== 1 ? "s" : ""}.`);
      router.refresh();
    } catch (err) {
      setRecomputeMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRecomputing(false);
    }
  }

  const setTab = useCallback(
    (id: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const variantOptions: VariantOption[] = variants.map((v) => ({
    key: v.key,
    label: v.label,
  }));

  return (
    <Page>
      <Masthead>
        <Breadcrumb>
          <Link href="/">Home</Link>
          <span>/</span>
          <span>Journal des Débats</span>
        </Breadcrumb>
        <Title>Journal des Débats</Title>
        <Subtitle>Politiques et Littéraires · Founded 1789</Subtitle>
        <TabBar role="tablist" aria-label="Débats hub sections">
          {TABS.map((t) => (
            <TabBtn
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              $active={activeTab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </TabBtn>
          ))}
        </TabBar>
      </Masthead>

      <TabContent role="tabpanel">
        {activeTab === "paper" && <PaperProfile />}

        {activeTab === "press" && <PressRoom />}

        {activeTab === "business" && <PressBusiness />}

        {activeTab === "connections" && (
          <GraphShell>
            {adminMode && (
              <AdminBar>
                <AdminBtn onClick={handleRecompute} disabled={recomputing}>
                  {recomputing ? "Recomputing…" : "⟳ Recompute graph layout"}
                </AdminBtn>
                <AdminNote>
                  GraphEditOverlay (add people / edges directly on canvas) — Graph Engine plan.
                  {recomputeMsg && <> {recomputeMsg}</>}
                </AdminNote>
              </AdminBar>
            )}
            <VariantSwitcher
              variants={variantOptions}
              activeKey={activeVariantKey}
              onVariantChange={setActiveVariantKey}
            />
            <GraphCanvas>
              <NetworkGraph
                people={people}
                relationships={relationships}
                coords={coords}
                labelMode="hover"
              />
            </GraphCanvas>
          </GraphShell>
        )}

        {activeTab === "people" && (
          <div>
            <PeopleToggle>
              <SubBtn $active={peopleSubview === "grid"} onClick={() => setPeopleSubview("grid")}>
                Portrait Gallery
              </SubBtn>
              <SubBtn $active={peopleSubview === "timelines"} onClick={() => setPeopleSubview("timelines")}>
                Overlapping Lives
              </SubBtn>
            </PeopleToggle>

            {peopleSubview === "grid" && <VignetteGrid people={vignettePeople} />}
            {peopleSubview === "timelines" && <StackedTimelines people={timelinePeople} />}
          </div>
        )}
      </TabContent>
    </Page>
  );
}
