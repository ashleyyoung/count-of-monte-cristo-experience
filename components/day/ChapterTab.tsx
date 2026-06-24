"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styled from "styled-components";
import type { DayPageData } from "@/lib/content";
import type { Chapter } from "@/lib/installments";
import {
  CHAPTER_TOP_ID,
  resolveActiveChapterNum,
  resolveChapterItemIndex,
} from "@/lib/chapters";
import { getAvailableLangs, hasNarration } from "@/lib/narration";
import type { ContributorInfo } from "./ContributorByline";
import { TabSection, EmptyState } from "./TabPrimitives";
import AdminItemList from "@/components/admin/AdminItemList";
import ChapterSubTabRow from "./ChapterSubTabRow";
import NarrationPlayer from "@/components/ui/NarrationPlayer";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
  chapters: Chapter[];
  activeChapterNum: string | null;
}

const NextChapterBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  padding: 10px 22px;
  margin-top: 8px;
  background: var(--gilt-warm);
  color: var(--ink-primary);
  border: 1px solid var(--gilt-warm);
  cursor: pointer;
  letter-spacing: 0.06em;
  align-self: flex-start;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: var(--gilt-deep);
    border-color: var(--gilt-deep);
  }
`;

function scrollToChapterTop() {
  const el = document.getElementById(CHAPTER_TOP_ID);
  if (!el) return;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  el.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "start",
  });
}

export default function ChapterTab({
  data,
  contributors,
  chapters,
  activeChapterNum,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolved, doc, installment_date } = data;
  const multi = chapters.length > 1;
  const selectedNum = resolveActiveChapterNum(chapters, activeChapterNum);
  const scheduleIndex = selectedNum
    ? chapters.findIndex((ch) => ch.num.toUpperCase() === selectedNum.toUpperCase())
    : 0;
  const itemIndex =
    selectedNum && scheduleIndex >= 0
      ? resolveChapterItemIndex(doc.chapter, selectedNum, scheduleIndex)
      : -1;

  const rawItems =
    multi && itemIndex >= 0 ? [doc.chapter[itemIndex]] : doc.chapter;
  const resolvedItems =
    multi && itemIndex >= 0 && resolved.chapter[itemIndex]
      ? [resolved.chapter[itemIndex]]
      : resolved.chapter;

  const activeChapter = selectedNum
    ? chapters.find((ch) => ch.num.toUpperCase() === selectedNum.toUpperCase())
    : null;

  const nextChapter =
    multi && scheduleIndex >= 0 && scheduleIndex < chapters.length - 1
      ? chapters[scheduleIndex + 1]
      : null;

  const goToNextChapter = useCallback(
    (next: Chapter) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "chapter");
      params.set("chapter", next.num);
      router.replace(`?${params.toString()}`, { scroll: false });
      window.setTimeout(scrollToChapterTop, 50);
    },
    [router, searchParams],
  );

  return (
    <TabSection id={CHAPTER_TOP_ID}>
      {multi && selectedNum && (
        <ChapterSubTabRow chapters={chapters} activeChapterNum={selectedNum} />
      )}
      {selectedNum && hasNarration(selectedNum) && (
        <NarrationPlayer
          chapterNum={selectedNum}
          chapterTitle={activeChapter?.title ?? ""}
          availableLangs={getAvailableLangs(selectedNum)}
        />
      )}
      <AdminItemList
        date={installment_date}
        section="chapter"
        rawItems={rawItems}
        resolvedItems={resolvedItems}
        contributors={contributors}
        sectionItemIndex={multi && itemIndex >= 0 ? itemIndex : undefined}
        emptyMessage={
          <EmptyState>Chapter text not yet ingested for this installment.</EmptyState>
        }
        adminItemContext={{ date: installment_date, isChapter: true }}
      />
      {nextChapter && (
        <NextChapterBtn
          type="button"
          onClick={() => goToNextChapter(nextChapter)}
        >
          Next chapter: {nextChapter.num}. {nextChapter.title} →
        </NextChapterBtn>
      )}
    </TabSection>
  );
}
