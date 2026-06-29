"use client";

import styled from "styled-components";
import { useRouter, useSearchParams } from "next/navigation";

import type { Chapter } from "@/lib/installments";
import { chapterTabLabel } from "@/lib/chapters";

export type TabId =
  | "overview"
  | "chapter"
  | "debats"
  | "art"
  | "science"
  | "original"
  | "translated"
  | "galignani";

const BASE_TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "chapter", label: "Chapter" },
  { id: "debats", label: "Débats" },
  { id: "art", label: "Art & exhibitions" },
  { id: "science", label: "Science" },
  { id: "original", label: "Original paper" },
  { id: "translated", label: "Translated paper" },
  { id: "galignani", label: "Galignani" },
];

interface Props {
  activeTab: TabId;
  chapters: Chapter[];
  translatedPageCount?: number;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Row = styled.nav`
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
    grid-template-columns: repeat(4, 1fr);
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

const Tab = styled.button<{ $active: boolean }>`
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
    border-right: 1px solid var(--rule-light);
    margin-top: 0;

    &:nth-child(4n) { border-right: none; }
    &:nth-last-child(-n+4) { border-bottom: none; }
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
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabs = BASE_TABS.map((tab) =>
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
    if (id === "translated" && translatedPageCount > 1) {
      if (!params.get("page")) {
        params.set("page", "1");
      }
    } else {
      params.delete("page");
    }
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <Row role="tablist" aria-label="Day content tabs">
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          $active={tab.id === activeTab}
          role="tab"
          aria-selected={tab.id === activeTab}
          onClick={() => handleTab(tab.id)}
        >
          <TabLabel $active={tab.id === activeTab}>{tab.label}</TabLabel>
        </Tab>
      ))}
    </Row>
  );
}
