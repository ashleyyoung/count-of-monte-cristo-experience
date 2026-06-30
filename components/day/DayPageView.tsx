"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styled from "styled-components";
import type { DayPageData } from "@/lib/content";
import type { Installment } from "@/lib/installments";
import { resolveActiveChapterNum } from "@/lib/chapters";
import type { ContributorInfo } from "@/components/day/ContributorByline";
import type { TabId } from "@/components/day/TabRow";
import { normalizeReaderTab } from "@/components/day/TabRow";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import { requestDayTranslation } from "@/app/actions/admin";
import DayTopBar from "@/components/day/DayTopBar";
import FeuilletonStrip from "@/components/day/FeuilletonStrip";
import ReadingColumn from "@/components/day/ReadingColumn";
import ParisSidebar from "@/components/day/ParisSidebar";
import OverviewTab from "@/components/day/OverviewTab";
import ChapterTab from "@/components/day/ChapterTab";
import DebatsTab from "@/components/day/DebatsTab";
import ArtTab from "@/components/day/ArtTab";
import ScienceTab from "@/components/day/ScienceTab";
import OriginalPaperTab from "@/components/day/OriginalPaperTab";
import FrenchTextPasteField from "@/components/admin/primitives/FrenchTextPasteField";
import { extractArk, texteBrutViewUrl, altoPageViewUrl } from "@/lib/gallica-links";
import TranslatedPaperTab from "@/components/day/TranslatedPaperTab";
import GalignaniTab from "@/components/day/GalignaniTab";
import ParisThatDayTab from "@/components/day/ParisThatDayTab";
import PaperTab, { type PaperLang } from "@/components/day/PaperTab";

/** Latest local translation run for this day (admin-only; null when none). */
export interface TranslationRunStatus {
  status: "queued" | "running" | "done" | "failed";
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
}

interface Props {
  data: DayPageData;
  installment: Installment;
  prevDate: string | null;
  nextDate: string | null;
  initialCompleted: boolean;
  isSignedIn: boolean;
  initialTab: TabId;
  contributors: Map<string, ContributorInfo>;
  /** True when the local CLI translation runner is available (dev / flag). */
  localRunnerEnabled: boolean;
  /** Latest translation run for this day, for the admin status line. */
  translationRun: TranslationRunStatus | null;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--paper-base);
`;

/**
 * Two grid columns: the feuilleton scan strip, and the reading column
 * (which lays out the chapter content + "Paris that day" sidebar
 * internally — see ReadingColumn's ColumnGrid). Below 800px the scan strip
 * hides itself (scans are also reachable via the Original Paper tab), so
 * this collapses to a single column holding just the reading column.
 */
const ThreeCol = styled.div`
  display: grid;
  grid-template-columns: 300px 1fr;
  flex: 1;
  min-height: 680px;

  @media (max-width: 1100px) {
    grid-template-columns: 240px 1fr;
  }

  @media (max-width: 800px) {
    grid-template-columns: 1fr;
  }
`;

const AdminBar = styled.div`
  padding: 8px 36px;
  background: rgba(201, 162, 75, 0.06);
  border-bottom: 1px dashed var(--gilt-warm);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;

  @media (max-width: 600px) {
    padding: 8px 20px;
  }
`;

const AdminBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 5px 12px;
  border: 1px solid var(--gilt-warm);
  border-radius: 3px;
  background: transparent;
  color: var(--ink-strong);
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover:not(:disabled) {
    background: rgba(201, 162, 75, 0.16);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const AdminSelect = styled.select`
  font-family: var(--font-labels-stack);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 5px 8px;
  border: 1px solid var(--gilt-warm);
  border-radius: 3px;
  background: transparent;
  color: var(--ink-strong);
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const AdminNote = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
`;

const RecoveryBar = styled.div`
  padding: 10px 36px;
  background: rgba(201, 162, 75, 0.04);
  border-bottom: 1px dashed var(--gilt-warm);
  display: flex;
  flex-direction: column;
  gap: 6px;

  @media (max-width: 600px) {
    padding: 10px 20px;
  }
`;

const RecoveryLabel = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-muted);
`;

const RecoveryLinkRow = styled.div`
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
`;

const RecoveryLink = styled.a`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  color: var(--ink-muted);

  &:hover {
    color: var(--gilt-deep);
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatDateLabel(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

/** Distinct contributors appearing in the day's content, for the rail. */
function figuresToday(
  data: DayPageData,
  contributors: Map<string, ContributorInfo>,
): ContributorInfo[] {
  const ids = new Set<string>();
  const { resolved } = data;
  const sections = [
    resolved.overview,
    resolved.news,
    resolved.chapter,
    resolved.debats.music,
    resolved.debats.theater,
    resolved.debats.art,
    resolved.debats.literature,
    resolved.art_exhibitions,
    resolved.science,
    resolved.galignani,
  ];
  for (const section of sections) {
    for (const item of section) {
      if (item.kind === "text" && item.contributor_id) ids.add(item.contributor_id);
    }
  }
  return [...ids]
    .map((id) => contributors.get(id))
    .filter((c): c is ContributorInfo => !!c)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatRunTime(iso: string): string {
  const dt = new Date(iso);
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function describeRun(run: TranslationRunStatus): string {
  switch (run.status) {
    case "queued":
      return `Last run: queued at ${formatRunTime(run.createdAt)}`;
    case "running":
      return `Last run: running since ${formatRunTime(run.createdAt)}…`;
    case "done":
      return `Last run: done${run.finishedAt ? ` at ${formatRunTime(run.finishedAt)}` : ""}`;
    case "failed":
      return `Last run: failed${run.error ? ` — ${run.error}` : ""}`;
    default:
      return "";
  }
}

const VALID_TABS: TabId[] = [
  "chapter", "paris", "paper",
  "overview", "debats", "art", "science", "original", "translated", "galignani",
];

function parseTab(raw: string | null | undefined, fallback: TabId): TabId {
  if (raw && VALID_TABS.includes(raw as TabId)) return raw as TabId;
  return fallback;
}

function getTabContent(
  tab: TabId,
  data: DayPageData,
  contributors: Map<string, ContributorInfo>,
  installment: Installment,
  activeChapterNum: string | null,
  nextDate: string | null,
  adminMode: boolean,
) {
  // Chapter and Galignani are identical in both modes.
  if (tab === "chapter") {
    return (
      <ChapterTab
        data={data}
        contributors={contributors}
        chapters={installment.chapters}
        activeChapterNum={activeChapterNum}
        nextDate={nextDate}
      />
    );
  }
  if (tab === "galignani") {
    return <GalignaniTab data={data} contributors={contributors} />;
  }

  // Admin sees every granular section so each stays editable.
  if (adminMode) {
    switch (tab) {
      case "debats":     return <DebatsTab data={data} contributors={contributors} />;
      case "art":        return <ArtTab data={data} contributors={contributors} />;
      case "science":    return <ScienceTab data={data} contributors={contributors} />;
      case "original":   return <OriginalPaperTab data={data} />;
      case "translated": return <TranslatedPaperTab data={data} contributors={contributors} />;
      case "overview":
      default:           return <OverviewTab data={data} contributors={contributors} installment={installment} />;
    }
  }

  // Readers get the consolidated surfaces; legacy/granular ids fold in.
  const reader = normalizeReaderTab(tab);
  if (reader === "paper") {
    const defaultLang: PaperLang = tab === "translated" ? "en" : "fr";
    return <PaperTab data={data} contributors={contributors} defaultLang={defaultLang} />;
  }
  return <ParisThatDayTab data={data} contributors={contributors} />;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DayPageView({
  data,
  installment,
  prevDate,
  nextDate,
  initialCompleted,
  isSignedIn,
  initialTab,
  contributors,
  localRunnerEnabled,
  translationRun,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { adminMode } = useAdminMode();
  const recoveryArk = data.doc.gallica_issue_url
    ? extractArk(data.doc.gallica_issue_url)
    : null;
  const [isTranslating, startTranslate] = useTransition();
  const [translateMsg, setTranslateMsg] = useState<string | null>(null);
  const [engine, setEngine] = useState<"sonnet" | "opus" | "haiku">("sonnet");
  const [isCompleted, setIsCompleted] = useState(initialCompleted);

  const activeTab = parseTab(searchParams.get("tab"), initialTab);
  const activeChapterNum = resolveActiveChapterNum(
    installment.chapters,
    searchParams.get("chapter"),
  );

  const handleTranslate = useCallback(() => {
    setTranslateMsg(null);
    startTranslate(async () => {
      try {
        const res = await requestDayTranslation(installment.date, engine);
        setTranslateMsg(
          res.accepted
            ? "Queued. It runs on your machine; refresh in a bit to see results."
            : (res.reason ?? "A run is already in progress for this day."),
        );
        router.refresh();
      } catch (err) {
        setTranslateMsg(
          err instanceof Error ? err.message : "Failed to queue translation.",
        );
      }
    });
  }, [installment.date, engine, router]);

  // Tab changes from TabRow update the URL; activeTab follows searchParams.

  const handleToggleComplete = useCallback(
    (date: string, completed: boolean) => {
      setIsCompleted(completed);
      fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, completed }),
      }).catch(() => {});
    },
    [],
  );

  const dateLabel = formatDateLabel(installment.date);
  const tabContent = getTabContent(
    activeTab,
    data,
    contributors,
    installment,
    activeChapterNum,
    nextDate,
    adminMode,
  );

  // The scan-heavy surfaces want full width, so the "On this day" rail is
  // hidden there; it stays beside the chapter and "Paris, that day".
  const showSidebar =
    normalizeReaderTab(activeTab) !== "paper" && activeTab !== "galignani";
  const figures = figuresToday(data, contributors);

  const multiChapter = installment.chapters.length > 1;
  const chapterTitle = multiChapter
    ? installment.label
    : installment.chapters[0]
      ? `${installment.chapters[0].num}. ${installment.chapters[0].title}`
      : installment.label;

  return (
    <Page>
      <DayTopBar
        installment={installment}
        prevDate={prevDate}
        nextDate={nextDate}
        isCompleted={isCompleted}
        isSignedIn={isSignedIn}
        onToggleComplete={handleToggleComplete}
      />

      {adminMode && localRunnerEnabled && (
        <AdminBar>
          <AdminSelect
            value={engine}
            onChange={(e) => setEngine(e.target.value as "sonnet" | "opus" | "haiku")}
            disabled={isTranslating}
            aria-label="Translation engine"
          >
            <option value="sonnet">Sonnet</option>
            <option value="opus">Opus</option>
            <option value="haiku">Haiku</option>
          </AdminSelect>
          <AdminBtn onClick={handleTranslate} disabled={isTranslating}>
            {isTranslating ? "Queuing…" : "Translate"}
          </AdminBtn>
          {translateMsg ? (
            <AdminNote>{translateMsg}</AdminNote>
          ) : translationRun ? (
            <AdminNote>{describeRun(translationRun)}</AdminNote>
          ) : (
            <AdminNote>
              Runs the translation on your machine via the local CLI; refresh to
              see results.
            </AdminNote>
          )}
        </AdminBar>
      )}

      {adminMode && recoveryArk && (
        <RecoveryBar>
          <RecoveryLabel>
            Manual recovery — paste French source text grabbed from Gallica in
            your own browser
          </RecoveryLabel>
          <RecoveryLinkRow>
            <RecoveryLink
              href={texteBrutViewUrl(recoveryArk)}
              target="_blank"
              rel="noopener noreferrer"
            >
              View texteBrut on Gallica ↗
            </RecoveryLink>
            {Array.from(
              { length: data.doc.gallica_page_count ?? 4 },
              (_, i) => i + 1,
            ).map((page) => (
              <RecoveryLink
                key={page}
                href={altoPageViewUrl(recoveryArk, page)}
                target="_blank"
                rel="noopener noreferrer"
              >
                View ALTO page {page} ↗
              </RecoveryLink>
            ))}
          </RecoveryLinkRow>
          <FrenchTextPasteField date={data.installment_date} />
        </RecoveryBar>
      )}

      <ThreeCol>
        <FeuilletonStrip
          stripImage={data.resolved.feuilleton_strip}
          originalPages={data.resolved.original_pages}
          gallicaUrl={data.doc.gallica_issue_url}
          dateLabel={dateLabel}
          installmentDate={data.installment_date}
        />

        <ReadingColumn
          chapterLabel={`Part ${installment.part} · Feuilleton`}
          chapterTitle={chapterTitle}
          chapterItems={data.resolved.chapter}
          chapters={installment.chapters}
          activeTab={activeTab}
          tabContent={tabContent}
          installmentDate={installment.date}
          translatedPageCount={data.resolved.translated_pages?.length ?? 0}
          showSidebar={showSidebar}
          sidebar={
            <ParisSidebar date={installment.date} figures={figures} />
          }
        />
      </ThreeCol>
    </Page>
  );
}
