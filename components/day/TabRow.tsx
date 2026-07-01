"use client";

import styled from "styled-components";
import { useRouter, useSearchParams } from "next/navigation";

import type { Chapter } from "@/lib/installments";
import { chapterTabLabel } from "@/lib/chapters";
import { useAdminMode } from "@/components/admin/AdminModeProvider";

export type TabId =
  | "chapter"
  | "paris"
  | "paper"
  | "overview"
  | "debats"
  | "art"
  | "science"
  | "original"
  | "translated"
  | "galignani";

/** Four consolidated surfaces readers see. Paris is the default landing tab. */
const READER_TABS: { id: TabId; label: string }[] = [
  { id: "paris", label: "Paris, that day" },
  { id: "chapter", label: "Chapter" },
  { id: "paper", label: "The paper" },
  { id: "galignani", label: "Galignani" },
];

/** Admin tabs — Paris consolidates overview/debats/art/science editing. */
const ADMIN_TABS: { id: TabId; label: string }[] = [
  { id: "paris", label: "Paris, that day" },
  { id: "chapter", label: "Chapter" },
  { id: "original", label: "Original paper" },
  { id: "translated", label: "Translated paper" },
  { id: "galignani", label: "Galignani" },
];

/** Map a granular/legacy tab id onto the reader surface that now contains it. */
export function normalizeReaderTab(tab: TabId): TabId {
  if (tab === "overview" || tab === "debats" || tab === "art" || tab === "science") {
    return "paris";
  }
  if (tab === "original" || tab === "translated") return "paper";
  return tab;
}

interface Props {
  activeTab: TabId;
  chapters: Chapter[];
  translatedPageCount?: number;
  galignaniPageCount?: number;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Row = styled.nav<{ $tabCount: number }>`
  display: flex;
  gap: 0;
  border-top: 1px solid var(--rule-light);
  margin-top: 16px;
  overflow-x: auto;
  flex-shrink: 0;

  &::-webkit-scrollbar { height: 3px; }
  &::-webkit-scrollbar-thumb { background: var(--rule-light); }

  @media (max-width: 800px) {
    display: grid;
    grid-template-columns: repeat(${({ $tabCount }) => Math.min(4, $tabCount)}, 1fr);
    overflow-x: visible;
    border-top: none;
  }
`;

const TabLabel = styled.span<{ $active: boolean }>`
  display: inline-block;

  @media (max-width: 800px) {
    border-bottom: 2px solid ${({ $active }) => ($active ? "var(--gilt-warm)" : "transparent")};
    padding-bottom: 2px;
  }
`;

const Tab = styled.button<{ $active: boolean; $lastInRow: boolean; $lastRow: boolean }>`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  letter-spacing: 0.06em;
  padding: 10px 16px;
  background: transparent;
  border: none;
  border-top: 2px solid ${({ $active }) => ($active ? "var(--gilt-warm)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--ink-primary)" : "var(--ink-muted)")};
  cursor: pointer;
  white-space: nowrap;
  margin-top: -1px;
  transition: color 0.15s;

  @media (max-width: 800px) {
    white-space: normal;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 8px;
    border-top: none;
    border-bottom: 1px solid var(--rule-light);
    border-right: 1px solid ${({ $lastInRow }) =>
      $lastInRow ? "transparent" : "var(--rule-light)"};
    margin-top: 0;

    ${({ $lastRow }) => $lastRow && "border-bottom: none;"}
  }

  &:hover:not([aria-selected="true"]) {
    color: var(--ink-secondary);
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: -2px;
  }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TabRow({
  activeTab,
  chapters,
  translatedPageCount = 0,
  galignaniPageCount = 0,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { adminMode } = useAdminMode();

  // Reader highlight folds granular/legacy ids onto their owning surface.
  const baseTabs = adminMode ? ADMIN_TABS : READER_TABS;
  const highlightTab = adminMode ? normalizeReaderTab(activeTab) : normalizeReaderTab(activeTab);
  const mobileCols = Math.min(4, baseTabs.length);

  const tabs = baseTabs.map((tab) =>
    tab.id === "chapter"
      ? { ...tab, label: chapterTabLabel(chapters.length) }
      : tab,
  );

  function handleTab(id: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", id);

    if (id === "chapter" && chapters.length > 1) {
      if (!params.get("chapter")) {
        params.set("chapter", chapters[0].num);
      }
    } else {
      params.delete("chapter");
    }

    // "The paper" opens on the French original; the English reader uses ?page.
    if (id === "paper") {
      if (!params.get("lang")) params.set("lang", "fr");
    } else {
      params.delete("lang");
    }

    if (id === "paris") {
      if (!params.get("paris")) params.set("paris", "overview");
    } else {
      params.delete("paris");
    }

    if (id === "galignani" && galignaniPageCount > 1) {
      if (!params.get("gpage")) params.set("gpage", "1");
    } else {
      params.delete("gpage");
    }

    if (id === "translated" && translatedPageCount > 1) {
      if (!params.get("page")) params.set("page", "1");
    } else if (id === "paper") {
      params.delete("page");
    } else {
      params.delete("page");
    }

    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <Row role="tablist" aria-label="Day content tabs" $tabCount={tabs.length}>
      {tabs.map((tab, index) => {
        const cols = mobileCols;
        const lastInRow = (index + 1) % cols === 0 || index === tabs.length - 1;
        const lastRow = index >= tabs.length - (tabs.length % cols || cols);
        return (
        <Tab
          key={tab.id}
          $active={tab.id === highlightTab}
          $lastInRow={lastInRow}
          $lastRow={lastRow}
          role="tab"
          aria-selected={tab.id === highlightTab}
          onClick={() => handleTab(tab.id)}
        >
          <TabLabel $active={tab.id === highlightTab}>{tab.label}</TabLabel>
        </Tab>
        );
      })}
    </Row>
  );
}
