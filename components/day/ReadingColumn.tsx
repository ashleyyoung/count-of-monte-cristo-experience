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

  @media (max-width: 1100px) {
    padding: 28px 32px;
  }
  @media (max-width: 700px) {
    padding: 20px 18px;
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
`;

const ChapterTitle = styled.h2`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: clamp(28px, 3.5vw, 42px);
  color: var(--ink-primary);
  margin: 0 0 24px;
  line-height: 1.05;
`;

const CtaRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin: 20px 0 4px;
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
  flex: 1;
  padding-top: 20px;
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

      <TabRow
        activeTab={activeTab}
        chapters={chapters}
        translatedPageCount={translatedPageCount}
      />

      <TabContent role="tabpanel">{tabContent}</TabContent>
    </Column>
  );
}
