"use client";

import type { DayPageData } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import { TabSection, TabSectionTitle, EmptyState } from "./TabPrimitives";
import AdminItemList from "@/components/admin/AdminItemList";
import MissingIssueNote from "./MissingIssueNote";
import { isMissingGallicaIssue } from "@/lib/missing-issues";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
}

export default function ArtTab({ data, contributors }: Props) {
  const { resolved, doc, installment_date } = data;
  const missing = isMissingGallicaIssue(installment_date);
  return (
    <TabSection>
      <TabSectionTitle>Art &amp; Exhibitions · Paris 1844</TabSectionTitle>
      <AdminItemList
        date={installment_date}
        section="art_exhibitions"
        rawItems={doc.art_exhibitions}
        resolvedItems={resolved.art_exhibitions}
        contributors={contributors}
        emptyMessage={
          missing ? (
            <MissingIssueNote />
          ) : (
            <EmptyState>
              Art and exhibition coverage for this date — Louvre Salon, Musée de Cluny,
              Versailles — is being prepared.
            </EmptyState>
          )
        }
        adminItemContext={{ date: installment_date }}
      />
    </TabSection>
  );
}
