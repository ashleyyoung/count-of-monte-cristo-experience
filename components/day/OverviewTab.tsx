"use client";

import type { DayPageData } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import { TabSection, TabSectionTitle, EmptyState } from "./TabPrimitives";
import AdminItemList from "@/components/admin/AdminItemList";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
}

export default function OverviewTab({ data, contributors }: Props) {
  const { resolved, doc, installment_date } = data;

  return (
    <TabSection>
      <TabSectionTitle>Highlights</TabSectionTitle>
      <AdminItemList
        date={installment_date}
        section="overview"
        rawItems={doc.overview}
        resolvedItems={resolved.overview}
        contributors={contributors}
        emptyMessage={<EmptyState>Overview content for this installment is being prepared.</EmptyState>}
        adminItemContext={{ date: installment_date }}
      />
    </TabSection>
  );
}
