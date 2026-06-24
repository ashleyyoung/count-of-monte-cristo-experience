"use client";

import type { DayPageData } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import { TabSection, TabSectionTitle, EmptyState } from "./TabPrimitives";
import AdminItemList from "@/components/admin/AdminItemList";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
}

export default function ScienceTab({ data, contributors }: Props) {
  const { resolved, doc, installment_date } = data;
  return (
    <TabSection>
      <TabSectionTitle>Sciences &amp; Advancements</TabSectionTitle>
      <AdminItemList
        date={installment_date}
        section="science"
        rawItems={doc.science}
        resolvedItems={resolved.science}
        contributors={contributors}
        emptyMessage={
          <EmptyState>
            Science coverage for this date — Académie des Sciences, Foucault,
            Donné and contemporaries — is being prepared.
          </EmptyState>
        }
        adminItemContext={{ date: installment_date }}
      />
    </TabSection>
  );
}
