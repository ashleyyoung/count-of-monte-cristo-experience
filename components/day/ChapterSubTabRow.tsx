"use client";

import styled from "styled-components";
import { useRouter, useSearchParams } from "next/navigation";
import type { Chapter } from "@/lib/installments";

interface Props {
  chapters: Chapter[];
  activeChapterNum: string;
}

const Row = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: rgba(120, 84, 40, 0.05);
  border: 1px solid var(--rule-light);
`;

const SubTab = styled.button<{ $active: boolean }>`
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-family: var(--font-body-stack);
  font-size: 14px;
  line-height: 1.3;
  padding: 7px 13px;
  background: ${({ $active }) => ($active ? "var(--paper-card)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--ink-primary)" : "var(--ink-muted)")};
  border: 1px solid
    ${({ $active }) => ($active ? "var(--gilt-warm)" : "var(--rule-light)")};
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;

  &:hover:not([aria-selected="true"]) {
    border-color: var(--rule-mid);
    color: var(--ink-secondary);
    background: rgba(239, 230, 207, 0.5);
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }
`;

const ChapterNum = styled.span`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: 13px;
  color: var(--gilt-deep);
  flex-shrink: 0;
`;

const ChapterTitle = styled.span`
  font-style: italic;
`;

export default function ChapterSubTabRow({ chapters, activeChapterNum }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSelect(num: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "chapter");
    params.set("chapter", num);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <Row role="tablist" aria-label="Chapters in this installment">
      {chapters.map((ch) => {
        const active =
          ch.num.toUpperCase() === activeChapterNum.toUpperCase();
        return (
          <SubTab
            key={ch.num}
            $active={active}
            role="tab"
            aria-selected={active}
            onClick={() => handleSelect(ch.num)}
          >
            <ChapterNum>{ch.num}.</ChapterNum>
            <ChapterTitle>{ch.title}</ChapterTitle>
          </SubTab>
        );
      })}
    </Row>
  );
}
