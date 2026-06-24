"use client";

import styled from "styled-components";
import type { DayPageData } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import { TabSection, TabSectionTitle, EmptyState, renderItems } from "./TabPrimitives";
import AdminItemList from "@/components/admin/AdminItemList";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
}

const SideBySide = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const ColWrapper = styled.div`
  background: var(--paper-feature);
  border: 1px solid var(--rule-light);
  padding: 14px;
`;

export default function GalignaniTab({ data, contributors }: Props) {
  const { resolved, doc, installment_date } = data;
  const items = resolved.galignani;
  const debatsItems = [
    ...resolved.debats.music,
    ...resolved.debats.theater,
    ...resolved.debats.art,
    ...resolved.debats.literature,
  ].slice(0, 3);

  if (items.length === 0) {
    return (
      <TabSection>
        <AdminItemList
          date={installment_date}
          section="galignani"
          rawItems={doc.galignani}
          resolvedItems={[]}
          contributors={contributors}
          emptyMessage={
            <EmptyState>
              Galignani&apos;s Messenger coverage for this date is being prepared.
            </EmptyState>
          }
        />
      </TabSection>
    );
  }

  const hasOverlap = debatsItems.length > 0;

  return (
    <TabSection>
      {hasOverlap ? (
        <>
          <TabSectionTitle>Débats · Galignani comparison</TabSectionTitle>
          <SideBySide>
            <ColWrapper>
              <TabSectionTitle>Journal des Débats</TabSectionTitle>
              {renderItems(debatsItems, contributors)}
            </ColWrapper>
            <ColWrapper>
              <TabSectionTitle>Galignani&apos;s Messenger</TabSectionTitle>
              <AdminItemList
                date={installment_date}
                section="galignani"
                rawItems={doc.galignani}
                resolvedItems={items}
                contributors={contributors}
              />
            </ColWrapper>
          </SideBySide>
        </>
      ) : (
        <>
          <TabSectionTitle>Galignani&apos;s Messenger</TabSectionTitle>
          <AdminItemList
            date={installment_date}
            section="galignani"
            rawItems={doc.galignani}
            resolvedItems={items}
            contributors={contributors}
          />
        </>
      )}
    </TabSection>
  );
}
