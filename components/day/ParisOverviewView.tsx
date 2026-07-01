"use client";

import styled from "styled-components";
import type { ResolvedDocItem, ResolvedTextItem } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import type { ParisSubTabId } from "./ParisThatDayTab";
import { renderItems } from "./TabPrimitives";
import { renderClaudeTranslationInline } from "@/lib/render-prose";
import { parseParisOverview } from "@/lib/types/paris-overview";
import type { ParisOverviewSectionId } from "@/lib/types/paris-overview";

interface Props {
  items: ResolvedDocItem[];
  contributors: Map<string, ContributorInfo>;
  onOpenSection: (id: ParisSubTabId) => void;
  /** Subtabs that actually have content — used to suppress dead highlight links. */
  populated: Set<ParisSubTabId>;
}

const SECTION_LABELS: Record<ParisOverviewSectionId, string> = {
  news: "News",
  society: "Society",
  scandals: "Scandals & Curiosities",
  arts: "Arts",
  literature: "Literature",
  science: "Science",
  music: "Music",
  theatre: "Theatre",
};

const Wrap = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const Lead = styled.p`
  margin: 0;
  font-family: var(--font-body-stack);
  font-size: 17px;
  line-height: 1.55;
  color: var(--ink-secondary);
  font-style: italic;
`;

const HighlightList = styled.ul`
  margin: 0;
  padding-left: 1.1em;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const HighlightItem = styled.li`
  font-family: var(--font-body-stack);
  font-size: 15px;
  line-height: 1.5;
  color: var(--ink-primary);

  &::marker {
    color: var(--gilt-warm);
  }
`;

const GroupHeading = styled.button`
  align-self: flex-start;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-labels-stack);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 500;
  color: var(--gilt-deep);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;

  &:hover {
    color: var(--ink-strong);
  }
`;

const GroupHeadingPlain = styled.h3`
  margin: 0;
  font-family: var(--font-labels-stack);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 500;
  color: var(--ink-muted);
`;

// ---------------------------------------------------------------------------
// v1 legacy styles (unchanged)
// ---------------------------------------------------------------------------

const SectionBlock = styled.section`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const SectionTitle = styled.h3`
  margin: 0;
  font-family: var(--font-labels-stack);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
  font-weight: 500;
`;

const Summary = styled.p`
  margin: 0;
  font-family: var(--font-body-stack);
  font-size: 16px;
  line-height: 1.55;
  color: var(--ink-primary);
`;

const ReadLink = styled.button`
  align-self: flex-start;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-labels-stack);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--gilt-deep);
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;

  &:hover {
    color: var(--ink-strong);
  }
`;

const NoteworthyBlock = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const NoteworthyList = styled.ul`
  margin: 0;
  padding-left: 1.1em;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const NoteworthyItem = styled.li`
  font-family: var(--font-body-stack);
  font-size: 15px;
  line-height: 1.5;
  color: var(--ink-primary);

  &::marker {
    color: var(--gilt-warm);
  }
`;

function firstText(items: ResolvedDocItem[]): string | null {
  const item = items.find((i): i is ResolvedTextItem => i.kind === "text");
  return item?.text ?? null;
}

export default function ParisOverviewView({
  items,
  contributors,
  onOpenSection,
  populated,
}: Props) {
  const raw = firstText(items);
  const overview = raw ? parseParisOverview(raw) : null;

  if (!overview) {
    return <>{renderItems(items, contributors)}</>;
  }

  if (overview.version === 2) {
    // Group highlights by section, preserving first-appearance order.
    const sectionOrder: ParisOverviewSectionId[] = [];
    const grouped = new Map<ParisOverviewSectionId, typeof overview.highlights>();
    for (const item of overview.highlights) {
      if (!grouped.has(item.section)) {
        sectionOrder.push(item.section);
        grouped.set(item.section, []);
      }
      grouped.get(item.section)!.push(item);
    }

    return (
      <Wrap>
        <Lead>{renderClaudeTranslationInline(overview.lead)}</Lead>
        {sectionOrder.map((sectionId) => {
          const highlights = grouped.get(sectionId)!;
          const canLink = populated.has(sectionId as ParisSubTabId);
          return (
            <SectionBlock key={sectionId}>
              {canLink ? (
                <GroupHeading
                  type="button"
                  onClick={() => onOpenSection(sectionId as ParisSubTabId)}
                >
                  {SECTION_LABELS[sectionId]}
                </GroupHeading>
              ) : (
                <GroupHeadingPlain>{SECTION_LABELS[sectionId]}</GroupHeadingPlain>
              )}
              <HighlightList>
                {highlights.map((item, i) => (
                  <HighlightItem key={i}>
                    {renderClaudeTranslationInline(item.text)}
                  </HighlightItem>
                ))}
              </HighlightList>
            </SectionBlock>
          );
        })}
      </Wrap>
    );
  }

  // v1 legacy rendering
  return (
    <Wrap>
      {overview.sections.map((section) => (
        <SectionBlock key={section.id}>
          <SectionTitle>{section.title}</SectionTitle>
          <Summary>{renderClaudeTranslationInline(section.summary)}</Summary>
          <ReadLink type="button" onClick={() => onOpenSection(section.id)}>
            Read full coverage →
          </ReadLink>
        </SectionBlock>
      ))}

      {overview.noteworthy.length > 0 && (
        <NoteworthyBlock>
          <SectionTitle>Noteworthy</SectionTitle>
          <NoteworthyList>
            {overview.noteworthy.map((item, i) => (
              <NoteworthyItem key={i}>
                {renderClaudeTranslationInline(item.text)}
                {item.section && populated.has(item.section) && (
                  <>
                    {" "}
                    <ReadLink
                      type="button"
                      onClick={() => onOpenSection(item.section!)}
                    >
                      Read more →
                    </ReadLink>
                  </>
                )}
              </NoteworthyItem>
            ))}
          </NoteworthyList>
        </NoteworthyBlock>
      )}
    </Wrap>
  );
}
