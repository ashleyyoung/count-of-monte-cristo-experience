"use client";

import type { ReactNode } from "react";
import styled from "styled-components";
import { useRouter, useSearchParams } from "next/navigation";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import AdminItemList from "@/components/admin/AdminItemList";
import type { DayPageData, ResolvedDocItem } from "@/lib/content";
import type { DocItem } from "@/lib/types/content";
import type { DayContentSection } from "@/lib/types/day-content-section";
import type { ContributorInfo } from "./ContributorByline";
import { TabSection, TabSectionTitle, EmptyState, renderItems } from "./TabPrimitives";
import ParisOverviewView from "./ParisOverviewView";
import MissingIssueNote from "./MissingIssueNote";
import { isMissingGallicaIssue } from "@/lib/missing-issues";
import type { TabId } from "./TabRow";

export type ParisSubTabId =
  | "overview"
  | "news"
  | "society"
  | "scandals"
  | "arts"
  | "literature"
  | "science"
  | "music"
  | "theatre";

const PARIS_SUB_TABS: { id: ParisSubTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "news", label: "News" },
  { id: "society", label: "Society" },
  { id: "scandals", label: "Scandals & Curiosities" },
  { id: "arts", label: "Arts" },
  { id: "literature", label: "Literature" },
  { id: "science", label: "Science" },
  { id: "music", label: "Music" },
  { id: "theatre", label: "Theatre" },
];

const LEGACY_TAB_TO_PARIS: Partial<Record<TabId, ParisSubTabId>> = {
  overview: "overview",
  debats: "music",
  art: "arts",
  science: "science",
};

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
  /** When landing from a legacy admin tab id before URL normalizes. */
  legacyTab?: TabId;
}

const SubTabRow = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
`;

const SubTab = styled.button<{ $active: boolean }>`
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

  &:hover:not([aria-selected="true"]) {
    border-color: var(--rule-mid);
    color: var(--ink-secondary);
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }
`;

const Lead = styled.div`
  border-left: 3px solid var(--gilt-warm);
  padding-left: 18px;
`;

const SectionBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

function hasItems(items: ResolvedDocItem[]): boolean {
  return items.length > 0;
}

function parseParisSubTab(raw: string | null): ParisSubTabId | null {
  if (!raw) return null;
  return PARIS_SUB_TABS.some((t) => t.id === raw) ? (raw as ParisSubTabId) : null;
}

export default function ParisThatDayTab({ data, contributors, legacyTab }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { adminMode } = useAdminMode();
  const { resolved, doc, installment_date } = data;
  const missing = isMissingGallicaIssue(installment_date);

  const populated = new Set<ParisSubTabId>();
  if (hasItems(resolved.overview)) populated.add("overview");
  if (hasItems(resolved.debats.art) || hasItems(resolved.art_exhibitions)) {
    populated.add("arts");
  }
  if (hasItems(resolved.debats.literature)) populated.add("literature");
  if (hasItems(resolved.science)) populated.add("science");
  if (hasItems(resolved.debats.music)) populated.add("music");
  if (hasItems(resolved.debats.theater)) populated.add("theatre");
  if (hasItems(resolved.news)) populated.add("news");
  if (hasItems(resolved.society)) populated.add("society");
  if (hasItems(resolved.scandals)) populated.add("scandals");

  const visibleTabs = adminMode
    ? PARIS_SUB_TABS
    : PARIS_SUB_TABS.filter((t) => populated.has(t.id));

  const fromUrl = parseParisSubTab(searchParams.get("paris"));
  const fromLegacy = legacyTab ? LEGACY_TAB_TO_PARIS[legacyTab] : undefined;
  const defaultSubTab: ParisSubTabId =
    visibleTabs[0]?.id ?? "overview";
  const activeSubTab =
    (fromUrl && visibleTabs.some((t) => t.id === fromUrl) ? fromUrl : null) ??
    (fromLegacy && visibleTabs.some((t) => t.id === fromLegacy)
      ? fromLegacy
      : null) ??
    (populated.has("overview") ? "overview" : defaultSubTab);

  function setSubTab(id: ParisSubTabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "paris");
    params.set("paris", id);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  const nothingForReader =
    !adminMode && visibleTabs.length === 0 && !hasItems(resolved.overview);

  if (nothingForReader) {
    if (missing) {
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

  function renderAdminSection(
    section: DayContentSection,
    rawItems: DocItem[],
    resolvedItems: ResolvedDocItem[],
    emptyMessage: ReactNode,
    options?: { hideHistory?: boolean },
  ) {
    return (
      <AdminItemList
        date={installment_date}
        section={section}
        rawItems={rawItems}
        resolvedItems={resolvedItems}
        contributors={contributors}
        emptyMessage={emptyMessage}
        adminItemContext={{
          date: installment_date,
          hideHistory: options?.hideHistory,
        }}
      />
    );
  }

  function renderSubTabContent() {
    if (adminMode) {
      switch (activeSubTab) {
        case "overview":
          return (
            <>
              {hasItems(resolved.overview) && (
                <Lead style={{ marginBottom: 20 }}>
                  <ParisOverviewView
                    items={resolved.overview}
                    contributors={contributors}
                    onOpenSection={setSubTab}
                    populated={populated}
                  />
                </Lead>
              )}
              {renderAdminSection(
                "overview",
                doc.overview,
                resolved.overview,
                <EmptyState style={{ fontSize: 13 }}>
                  Highlights overview not yet written for this day.
                </EmptyState>,
                { hideHistory: true },
              )}
            </>
          );
        case "arts":
          return (
            <>
              <div>
                <TabSectionTitle>Art &amp; Letters</TabSectionTitle>
                {renderAdminSection(
                  "debats.art",
                  doc.debats?.art ?? [],
                  resolved.debats.art,
                  <EmptyState style={{ fontSize: 13 }}>
                    Art &amp; Letters coverage forthcoming.
                  </EmptyState>,
                )}
              </div>
              <div>
                <TabSectionTitle>Art &amp; Exhibitions</TabSectionTitle>
                {renderAdminSection(
                  "art_exhibitions",
                  doc.art_exhibitions,
                  resolved.art_exhibitions,
                  <EmptyState style={{ fontSize: 13 }}>
                    Art and exhibition coverage for this date is being prepared.
                  </EmptyState>,
                )}
              </div>
            </>
          );
        case "literature":
          return (
            <>
              <TabSectionTitle>Literature</TabSectionTitle>
              {renderAdminSection(
                "debats.literature",
                doc.debats?.literature ?? [],
                resolved.debats.literature,
                <EmptyState style={{ fontSize: 13 }}>
                  Literature coverage forthcoming.
                </EmptyState>,
              )}
            </>
          );
        case "science":
          return (
            <>
              <TabSectionTitle>Science</TabSectionTitle>
              {renderAdminSection(
                "science",
                doc.science,
                resolved.science,
                missing ? (
                  <MissingIssueNote />
                ) : (
                  <EmptyState style={{ fontSize: 13 }}>
                    Science coverage for this date is being prepared.
                  </EmptyState>
                ),
              )}
            </>
          );
        case "music":
          return (
            <>
              <TabSectionTitle>Music</TabSectionTitle>
              {renderAdminSection(
                "debats.music",
                doc.debats?.music ?? [],
                resolved.debats.music,
                <EmptyState style={{ fontSize: 13 }}>
                  Music coverage forthcoming.
                </EmptyState>,
              )}
            </>
          );
        case "theatre":
          return (
            <>
              <TabSectionTitle>Theatre</TabSectionTitle>
              {renderAdminSection(
                "debats.theater",
                doc.debats?.theater ?? [],
                resolved.debats.theater,
                <EmptyState style={{ fontSize: 13 }}>
                  Theatre coverage forthcoming.
                </EmptyState>,
              )}
            </>
          );
        case "news":
          return (
            <>
              <TabSectionTitle>News &amp; Politics</TabSectionTitle>
              {renderAdminSection(
                "news",
                doc.news,
                resolved.news,
                <EmptyState style={{ fontSize: 13 }}>
                  Front-page news coverage forthcoming.
                </EmptyState>,
              )}
            </>
          );
        case "society":
          return (
            <>
              <TabSectionTitle>Society</TabSectionTitle>
              {renderAdminSection(
                "society",
                doc.society,
                resolved.society,
                <EmptyState style={{ fontSize: 13 }}>
                  Society coverage forthcoming.
                </EmptyState>,
              )}
            </>
          );
        case "scandals":
          return (
            <>
              <TabSectionTitle>Scandals &amp; Curiosities</TabSectionTitle>
              {renderAdminSection(
                "scandals",
                doc.scandals,
                resolved.scandals,
                <EmptyState style={{ fontSize: 13 }}>
                  Scandals &amp; curiosities coverage forthcoming.
                </EmptyState>,
              )}
            </>
          );
      }
    }

    switch (activeSubTab) {
      case "overview":
        return (
          <Lead>
            <ParisOverviewView
              items={resolved.overview}
              contributors={contributors}
              onOpenSection={setSubTab}
              populated={populated}
            />
          </Lead>
        );
      case "arts":
        return (
          <SectionBlock>
            {hasItems(resolved.debats.art) && (
              <div>
                <TabSectionTitle>Art &amp; Letters</TabSectionTitle>
                {renderItems(resolved.debats.art, contributors)}
              </div>
            )}
            {hasItems(resolved.art_exhibitions) && (
              <div>
                <TabSectionTitle>Art &amp; Exhibitions</TabSectionTitle>
                {renderItems(resolved.art_exhibitions, contributors)}
              </div>
            )}
          </SectionBlock>
        );
      case "literature":
        return renderItems(resolved.debats.literature, contributors);
      case "science":
        return renderItems(resolved.science, contributors);
      case "music":
        return renderItems(resolved.debats.music, contributors);
      case "theatre":
        return renderItems(resolved.debats.theater, contributors);
      case "news":
        return renderItems(resolved.news, contributors);
      case "society":
        return renderItems(resolved.society, contributors);
      case "scandals":
        return renderItems(resolved.scandals, contributors);
    }
  }

  return (
    <TabSection>
      {missing && adminMode && <MissingIssueNote />}

      {visibleTabs.length > 1 && (
        <SubTabRow role="tablist" aria-label="Paris sections">
          {visibleTabs.map((tab) => (
            <SubTab
              key={tab.id}
              $active={tab.id === activeSubTab}
              role="tab"
              aria-selected={tab.id === activeSubTab}
              onClick={() => setSubTab(tab.id)}
            >
              {tab.label}
            </SubTab>
          ))}
        </SubTabRow>
      )}

      {renderSubTabContent()}
    </TabSection>
  );
}
