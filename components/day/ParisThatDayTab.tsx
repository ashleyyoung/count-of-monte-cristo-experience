"use client";

/**
 * "Paris, that day" — the consolidated reader front page for the installment.
 *
 * Opens with the editorial standfirst (the summarize-day `overview` prose), then
 * the recovered front-page news, then the Débats arts sections, the Salon, and
 * science. Each section is read-only here; admins edit the granular sections via
 * their dedicated admin tabs. Empty sections are omitted for readers — when the
 * whole day is empty we fall back to a single "to be recovered" note.
 */

import styled from "styled-components";
import type { DayPageData, ResolvedDocItem } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import { TabSection, TabSectionTitle, EmptyState, renderItems } from "./TabPrimitives";
import MissingIssueNote from "./MissingIssueNote";
import { isMissingGallicaIssue } from "@/lib/missing-issues";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
}

const Lead = styled.div`
  border-left: 3px solid var(--gilt-warm);
  padding-left: 18px;
`;

const SectionBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

interface Section {
  label: string;
  items: ResolvedDocItem[];
}

export default function ParisThatDayTab({ data, contributors }: Props) {
  const { resolved, installment_date } = data;

  const lead = resolved.overview;

  const sections: Section[] = [
    { label: "News & Politics",     items: resolved.news },
    { label: "Music",               items: resolved.debats.music },
    { label: "Theatre",             items: resolved.debats.theater },
    { label: "Art & Letters",       items: resolved.debats.art },
    { label: "Literature",          items: resolved.debats.literature },
    { label: "Art & Exhibitions",   items: resolved.art_exhibitions },
    { label: "Science",             items: resolved.science },
  ];

  const present = sections.filter((s) => s.items.length > 0);
  const hasLead = lead.length > 0;

  if (!hasLead && present.length === 0) {
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
          The city&rsquo;s news for this morning is still being recovered. The
          original issue is available{" "}
          {data.doc.gallica_issue_url ? (
            <a href={data.doc.gallica_issue_url} target="_blank" rel="noopener noreferrer">
              on Gallica ↗
            </a>
          ) : (
            "on gallica.bnf.fr"
          )}
          .
        </EmptyState>
      </TabSection>
    );
  }

  return (
    <TabSection>
      {hasLead && <Lead>{renderItems(lead, contributors)}</Lead>}

      {present.map((section) => (
        <SectionBlock key={section.label}>
          <TabSectionTitle>{section.label}</TabSectionTitle>
          {renderItems(section.items, contributors)}
        </SectionBlock>
      ))}
    </TabSection>
  );
}
