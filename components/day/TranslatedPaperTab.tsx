"use client";

import styled from "styled-components";
import { useSearchParams } from "next/navigation";
import type { DayPageData } from "@/lib/content";
import { resolveActivePaperPage } from "@/lib/paper-pages";
import type { ContributorInfo } from "./ContributorByline";
import type { DayContentSection } from "@/lib/types/day-content-section";
import PaperPageSubTabRow from "./PaperPageSubTabRow";
import { TabSection, TabSectionTitle, EmptyState, renderItems } from "./TabPrimitives";
import MissingIssueNote from "./MissingIssueNote";
import SectionedPaperPage from "./SectionedPaperPage";
import { isMissingGallicaIssue } from "@/lib/missing-issues";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
}

const SectionBlock = styled.div<{ $first: boolean }>`
  border-top: ${({ $first }) => ($first ? "none" : "1px solid var(--rule-light)")};
  padding-top: ${({ $first }) => ($first ? "0" : "28px")};
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

interface SectionEntry {
  label: string;
  items: DayPageData["resolved"]["overview"];
  section: DayContentSection;
  isChapter?: boolean;
}

const SEGMENTED_SECTIONS: Omit<SectionEntry, "items">[] = [
  { label: "News & Politics",                       section: "overview" },
  { label: "Feuilleton — Le Comte de Monte-Cristo", section: "chapter", isChapter: true },
  { label: "Débats — Music",                        section: "debats.music" },
  { label: "Débats — Theatre",                      section: "debats.theater" },
  { label: "Débats — Art & Letters",                section: "debats.art" },
  { label: "Débats — Literature",                   section: "debats.literature" },
  { label: "Art Exhibitions",                       section: "art_exhibitions" },
  { label: "Science",                               section: "science" },
];

function getSectionItems(
  resolved: DayPageData["resolved"],
  section: DayContentSection,
) {
  switch (section) {
    case "overview":          return resolved.overview;
    case "chapter":           return resolved.chapter;
    case "debats.music":      return resolved.debats.music;
    case "debats.theater":    return resolved.debats.theater;
    case "debats.art":        return resolved.debats.art;
    case "debats.literature": return resolved.debats.literature;
    case "art_exhibitions":   return resolved.art_exhibitions;
    case "science":           return resolved.science;
    case "galignani":         return resolved.galignani;
    default:                  return [];
  }
}

export default function TranslatedPaperTab({ data, contributors }: Props) {
  const searchParams = useSearchParams();
  const { resolved, installment_date } = data;

  // Per-page translations are the primary view: each page is translated
  // independently so the full issue is covered.
  const pages = resolved.translated_pages ?? [];

  if (pages.length > 0) {
    const activePage = resolveActivePaperPage(
      pages.length,
      searchParams.get("page"),
    );
    const item = pages[activePage - 1];

    // Section-aware page: render the scan + translation side-by-side with
    // hover-to-highlight when the item carries reading-order section regions.
    const scanUrl = resolved.original_pages[activePage - 1]?.url ?? null;

    return (
      <TabSection>
        {pages.length > 1 && (
          <PaperPageSubTabRow pageCount={pages.length} activePage={activePage} />
        )}
        {item && item.kind === "text" && (item.sections?.length ?? 0) > 0 ? (
          <SectionedPaperPage item={item} scanUrl={scanUrl} />
        ) : (
          item &&
          renderItems([item], contributors, {
            date: installment_date,
            section: "translated_pages",
          })
        )}
      </TabSection>
    );
  }

  // Fallback: show the segmented sections for issues translated before
  // per-page translation was added.
  const sections: SectionEntry[] = SEGMENTED_SECTIONS.map((s) => ({
    ...s,
    items: getSectionItems(resolved, s.section),
  })).filter(({ items }) => items.length > 0);

  if (sections.length > 0) {
    return (
      <TabSection>
        {sections.map(({ label, items, section, isChapter }, i) => (
          <SectionBlock key={section} $first={i === 0}>
            <TabSectionTitle>{label}</TabSectionTitle>
            {renderItems(items, contributors, {
              date: installment_date,
              section,
              isChapter,
            })}
          </SectionBlock>
        ))}
      </TabSection>
    );
  }

  if (isMissingGallicaIssue(installment_date)) {
    return (
      <TabSection>
        <MissingIssueNote />
      </TabSection>
    );
  }

  return (
    <TabSection>
      <EmptyState>
        This issue has not been translated yet. Run{" "}
        <code style={{ fontFamily: "monospace", fontSize: 12 }}>
          npx tsx scripts/translate/translate-day.ts --date={installment_date}
        </code>
      </EmptyState>
    </TabSection>
  );
}
