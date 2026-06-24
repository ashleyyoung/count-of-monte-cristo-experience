"use client";

import type { DayPageData } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import { TabSection, TabSectionTitle, EmptyState } from "./TabPrimitives";
import AdminItemList from "@/components/admin/AdminItemList";
import type { DayContentSection } from "@/lib/types/day-content-section";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
}

const SECTIONS: { key: keyof DayPageData["resolved"]["debats"]; section: DayContentSection; label: string }[] = [
  { key: "music",      section: "debats.music",      label: "Music" },
  { key: "theater",    section: "debats.theater",     label: "Theatre" },
  { key: "art",        section: "debats.art",         label: "Art & Lettres" },
  { key: "literature", section: "debats.literature",  label: "Literature" },
];

export default function DebatsTab({ data, contributors }: Props) {
  const { debats } = data.resolved;
  const { debats: rawDebats } = data.doc;
  const { installment_date } = data;

  const hasAny = SECTIONS.some(({ key }) => debats[key].length > 0);

  // In admin mode, show all sections even when empty so content can be added.
  // AdminItemList shows "empty message" + Add button when raw list is empty.
  return (
    <TabSection>
      {!hasAny && (
        <EmptyState>
          Débats coverage for this installment is being prepared. The original
          issue is available{" "}
          {data.doc.gallica_issue_url ? (
            <a href={data.doc.gallica_issue_url} target="_blank" rel="noopener noreferrer">
              on Gallica ↗
            </a>
          ) : (
            "on gallica.bnf.fr"
          )}
          .
        </EmptyState>
      )}

      {SECTIONS.map(({ key, section, label }) => (
        <div key={key}>
          <TabSectionTitle>{label}</TabSectionTitle>
          <AdminItemList
            date={installment_date}
            section={section}
            rawItems={rawDebats[key]}
            resolvedItems={debats[key]}
            contributors={contributors}
            emptyMessage={<EmptyState style={{ fontSize: 13 }}>{label} coverage forthcoming.</EmptyState>}
            adminItemContext={{ date: installment_date }}
          />
        </div>
      ))}
    </TabSection>
  );
}
