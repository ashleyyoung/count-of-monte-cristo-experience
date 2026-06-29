"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styled from "styled-components";
import type { DayPageData, ResolvedDocItem, ResolvedTextItem } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import type { Installment } from "@/lib/installments";
import type { TabId } from "./TabRow";
import { TabSection, TabSectionTitle, EmptyState } from "./TabPrimitives";
import AdminItemList from "@/components/admin/AdminItemList";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
  installment: Installment;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const ChapterTeaser = styled.div`
  border-left: 3px solid var(--gilt-warm);
  padding: 14px 20px;
  background: var(--paper-card);
`;

const TeaserLabel = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gilt-warm);
  margin-bottom: 6px;
`;

const TeaserExcerpt = styled.p`
  font-family: var(--font-body-stack);
  font-size: 15px;
  line-height: 1.65;
  color: var(--ink-secondary);
  margin: 0 0 12px;
`;

const SectionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
`;

const SectionCard = styled.div`
  border: 1px solid var(--rule-light);
  background: var(--paper-card);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionCardLabel = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gilt-warm);
`;

const SectionCardText = styled.p`
  font-family: var(--font-body-stack);
  font-size: 13px;
  line-height: 1.55;
  color: var(--ink-secondary);
  margin: 0;
  flex: 1;
`;

const CtaButton = styled.button`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--ink-muted);
  text-align: left;
  padding: 0;
  letter-spacing: 0.04em;
  align-self: flex-start;

  &:hover {
    color: var(--gilt-deep);
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstTextItem(items: ResolvedDocItem[]): ResolvedTextItem | null {
  return (items.find((i): i is ResolvedTextItem => i.kind === "text") ?? null);
}

function plainTruncate(text: string, max: number): string {
  const plain = text.replace(/[#*_`]/g, "").replace(/\n+/g, " ").trim();
  if (plain.length <= max) return plain;
  const cut = plain.lastIndexOf(" ", max);
  return plain.slice(0, cut > 0 ? cut : max) + "…";
}

interface SectionTeaser {
  tabId: TabId;
  label: string;
  items: ResolvedDocItem[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OverviewTab({ data, contributors, installment }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolved, doc, installment_date } = data;

  const goToTab = useCallback(
    (tab: TabId) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const chapterLabel =
    installment.chapters.length === 1
      ? `Chapter ${installment.chapters[0].num} — ${installment.chapters[0].title}`
      : `Chapters ${installment.chapters[0]?.num}–${installment.chapters[installment.chapters.length - 1]?.num}`;

  const chapterTeaser = firstTextItem(resolved.chapter);

  const sectionTeasers: SectionTeaser[] = (
    [
      { tabId: "debats",    label: "Music",             items: resolved.debats.music },
      { tabId: "debats",    label: "Theatre",           items: resolved.debats.theater },
      { tabId: "debats",    label: "Literature",        items: resolved.debats.literature },
      { tabId: "galignani", label: "Galignani",         items: resolved.galignani },
      { tabId: "art",       label: "Art & exhibitions", items: resolved.art_exhibitions },
      { tabId: "science",   label: "Science",           items: resolved.science },
    ] as SectionTeaser[]
  ).filter((s) => firstTextItem(s.items) !== null);

  const hasHighlights = resolved.overview.length > 0;
  const hasSections = sectionTeasers.length > 0;
  const hasAnything = hasHighlights || chapterTeaser !== null || hasSections;

  if (!hasAnything) {
    return (
      <TabSection>
        <EmptyState>Content for this installment is being prepared.</EmptyState>
      </TabSection>
    );
  }

  return (
    <TabSection>
      {/* Chapter excerpt */}
      {chapterTeaser && (
        <div>
          <TabSectionTitle>Today&rsquo;s Installment</TabSectionTitle>
          <ChapterTeaser>
            <TeaserLabel>{chapterLabel}</TeaserLabel>
            <TeaserExcerpt>{plainTruncate(chapterTeaser.text, 280)}</TeaserExcerpt>
            <CtaButton type="button" onClick={() => goToTab("chapter")}>
              Read the full chapter →
            </CtaButton>
          </ChapterTeaser>
        </div>
      )}

      {/* Curated highlights */}
      {hasHighlights && (
        <div>
          <TabSectionTitle>Highlights</TabSectionTitle>
          <AdminItemList
            date={installment_date}
            section="overview"
            rawItems={doc.overview}
            resolvedItems={resolved.overview}
            contributors={contributors}
            emptyMessage={null}
            adminItemContext={{ date: installment_date }}
          />
        </div>
      )}

      {/* Section teasers */}
      {hasSections && (
        <div>
          <TabSectionTitle>In Paris, that day</TabSectionTitle>
          <SectionGrid>
            {sectionTeasers.map((section, i) => {
              const item = firstTextItem(section.items)!;
              return (
                <SectionCard key={`${section.tabId}-${section.label}-${i}`}>
                  <SectionCardLabel>{section.label}</SectionCardLabel>
                  <SectionCardText>{plainTruncate(item.text, 160)}</SectionCardText>
                  <CtaButton type="button" onClick={() => goToTab(section.tabId)}>
                    Read more →
                  </CtaButton>
                </SectionCard>
              );
            })}
          </SectionGrid>
        </div>
      )}
    </TabSection>
  );
}
