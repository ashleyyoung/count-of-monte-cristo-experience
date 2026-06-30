"use client";

import styled from "styled-components";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ResolvedDocItem } from "@/lib/content";
import type { Chapter } from "@/lib/installments";
import { resolveActiveChapterNum } from "@/lib/chapters";
import { hasNarration } from "@/lib/narration";
import type { TabId } from "./TabRow";
import TabRow from "./TabRow";

interface Props {
  chapterLabel: string;
  chapterTitle: string;
  chapterItems: ResolvedDocItem[];
  chapters: Chapter[];
  activeTab: TabId;
  tabContent: React.ReactNode;
  installmentDate: string;
  translatedPageCount?: number;
  /** When false, the rail is hidden and content runs full width (scan tabs). */
  showSidebar?: boolean;
  /** The "On this day" rail — rendered as a side column on desktop, and as a
   *  collapsible section between the tabs and the chapter content on mobile
   *  (see ColumnGrid below). */
  sidebar: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Column = styled.main`
  background: var(--paper-base);
  padding: 38px 56px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  min-width: 0;

  @media (max-width: 1100px) {
    padding: 28px 32px;
  }
  @media (max-width: 700px) {
    padding: 20px 18px;
  }
`;

/**
 * Lays out the chapter content and the "Paris that day" sidebar together.
 *
 * Mobile (<=800px): a plain flex column — no grid tracks, so nothing can
 * be forced wider than the viewport. Items stack in DOM source order, which
 * places the sidebar's collapsible toggle + panel right after the tabs and
 * before the chapter content.
 *
 * Desktop (>800px): a 2-col grid — sidebar occupies a named "side" area
 * spanning every row, visually identical to the old 3rd grid column. The
 * content track is minmax(0, 1fr) (NOT a bare 1fr, which is minmax(auto,
 * 1fr) and would expand to the content's min-content width and overflow).
 */
const ColumnGrid = styled.div<{ $noSidebar: boolean }>`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;

  @media (min-width: 801px) {
    display: grid;
    align-items: start;

    ${({ $noSidebar }) =>
      $noSidebar
        ? `
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "kicker"
        "title"
        "cta"
        "tabs"
        "content";
      grid-template-rows: auto auto auto auto 1fr;
    `
        : `
      grid-template-columns: minmax(0, 1fr) 318px;
      grid-template-areas:
        "kicker side"
        "title side"
        "cta side"
        "tabs side"
        "content side";
      grid-template-rows: auto auto auto auto 1fr;
    `}
  }

  @media (min-width: 801px) and (max-width: 1100px) {
    grid-template-columns: ${({ $noSidebar }) =>
      $noSidebar ? "minmax(0, 1fr)" : "minmax(0, 1fr) 260px"};
  }
`;

const ChapterKicker = styled.p`
  font-family: var(--font-display-stack);
  font-style: italic;
  font-size: 14px;
  color: var(--gilt-warm);
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 0 0 8px;
  grid-area: kicker;
`;

const ChapterTitle = styled.h2`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: clamp(28px, 3.5vw, 42px);
  color: var(--ink-primary);
  margin: 0 0 24px;
  line-height: 1.05;
  grid-area: title;
`;

const CtaRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 20px 0 4px;
  grid-area: cta;
`;

const TabsArea = styled.div`
  grid-area: tabs;
`;

const SidebarToggleInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
`;

const SidebarToggleIcon = styled.span`
  display: inline-block;
  transition: transform 0.15s;
`;

const SidebarToggleLabel = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  margin-top: 16px;
  padding: 10px 14px;
  background: var(--paper-card);
  border: 1px solid var(--rule-light);
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--ink-secondary);

  ${SidebarToggleInput}:checked ~ & ${SidebarToggleIcon} {
    transform: rotate(90deg);
  }

  @media (min-width: 801px) {
    display: none;
  }
`;

const SidebarPanelWrap = styled.div`
  grid-area: side;
  min-width: 0;
  display: grid;
  grid-template-rows: 0fr;
  overflow: hidden;
  transition: grid-template-rows 0.2s ease;

  ${SidebarToggleInput}:checked ~ & {
    grid-template-rows: 1fr;
  }

  @media (min-width: 801px) {
    grid-template-rows: 1fr;
    overflow: visible;
  }
`;

const SidebarPanelInner = styled.div`
  overflow: hidden;
  min-height: 0;
`;

const CtaPrimary = styled(Link)`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  padding: 10px 22px;
  background: var(--gilt-warm);
  color: var(--ink-primary);
  text-decoration: none;
  border: 1px solid var(--gilt-warm);
  transition: background 0.15s;
  letter-spacing: 0.06em;

  &:hover {
    background: var(--gilt-deep);
    border-color: var(--gilt-deep);
  }
`;

const CtaOutlineLink = styled(Link)`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  padding: 10px 22px;
  background: transparent;
  color: var(--ink-secondary);
  border: 1px solid var(--rule-mid);
  cursor: pointer;
  letter-spacing: 0.06em;
  text-decoration: none;
  transition: border-color 0.15s, color 0.15s;

  &:hover {
    border-color: var(--ink-secondary);
    color: var(--ink-primary);
  }
`;

const CtaOutline = styled.button`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  padding: 10px 22px;
  background: transparent;
  color: var(--ink-secondary);
  border: 1px solid var(--rule-mid);
  cursor: pointer;
  letter-spacing: 0.06em;
  transition: border-color 0.15s, color 0.15s;

  &:hover {
    border-color: var(--ink-secondary);
    color: var(--ink-primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const TabContent = styled.div`
  padding-top: 20px;
  grid-area: content;
  min-width: 0;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReadingColumn({
  chapterLabel,
  chapterTitle,
  chapters,
  activeTab,
  tabContent,
  installmentDate,
  translatedPageCount = 0,
  showSidebar = true,
  sidebar,
}: Props) {
  const searchParams = useSearchParams();
  const hasChapterAudio = chapters.some((ch) => hasNarration(ch.num));

  const activeChapterNum = resolveActiveChapterNum(
    chapters,
    activeTab === "chapter" ? searchParams.get("chapter") : null,
  );
  const listenChapterNum =
    activeChapterNum && hasNarration(activeChapterNum)
      ? activeChapterNum
      : chapters.find((ch) => hasNarration(ch.num))?.num ?? null;

  const listenHref = listenChapterNum
    ? chapters.length > 1
      ? `/day/${installmentDate}?tab=chapter&chapter=${encodeURIComponent(listenChapterNum)}#narration`
      : `/day/${installmentDate}?tab=chapter#narration`
    : null;

  const listenLabel =
    chapters.length > 1
      ? "Listen to these chapters"
      : "Listen to this chapter";

  const chapterHref =
    chapters.length > 1
      ? `/day/${installmentDate}?tab=chapter&chapter=${encodeURIComponent(chapters[0].num)}`
      : `/day/${installmentDate}?tab=chapter`;

  return (
    <Column>
      <ColumnGrid $noSidebar={!showSidebar}>
        <ChapterKicker>{chapterLabel}</ChapterKicker>
        <ChapterTitle>{chapterTitle}</ChapterTitle>

        {activeTab !== "chapter" && (
          <CtaRow>
            <CtaPrimary href={chapterHref}>
              Continue reading →
            </CtaPrimary>
            {listenHref ? (
              <CtaOutlineLink
                href={listenHref}
                scroll={false}
                title="Go to chapter narration player"
              >
                {listenLabel}
              </CtaOutlineLink>
            ) : (
              <CtaOutline
                disabled={!hasChapterAudio}
                title={!hasChapterAudio ? "Audio not yet available" : undefined}
              >
                {listenLabel}
              </CtaOutline>
            )}
          </CtaRow>
        )}

        <TabsArea>
          <TabRow
            activeTab={activeTab}
            chapters={chapters}
            translatedPageCount={translatedPageCount}
          />
        </TabsArea>

        {showSidebar && (
          <>
            <SidebarToggleInput type="checkbox" id="paris-sidebar-toggle" />
            <SidebarToggleLabel htmlFor="paris-sidebar-toggle">
              <span>On this day</span>
              <SidebarToggleIcon aria-hidden="true">›</SidebarToggleIcon>
            </SidebarToggleLabel>
            <SidebarPanelWrap>
              <SidebarPanelInner>{sidebar}</SidebarPanelInner>
            </SidebarPanelWrap>
          </>
        )}

        <TabContent role="tabpanel">{tabContent}</TabContent>
      </ColumnGrid>
    </Column>
  );
}
