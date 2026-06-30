import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getDayPageData } from "@/lib/content";
import { getByDate, getNext, getPrev } from "@/lib/installments";
import { createClient } from "@/lib/supabase/server";
import { getCompletedDates } from "@/lib/progress";
import { getBeatLabel } from "@/lib/beat-display";
import { listLinkablePeople } from "@/lib/people";
import type { LinkablePerson } from "@/lib/people-linker";
import type { ContributorInfo } from "@/components/day/ContributorByline";
import type { TabId } from "@/components/day/TabRow";
import DayPageView, {
  type TranslationRunStatus,
} from "@/components/day/DayPageView";

interface PageProps {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ tab?: string }>;
}

// ---------------------------------------------------------------------------
// Contributor resolver (server-side, alongside main query)
// ---------------------------------------------------------------------------

/** Byline map (keyed by id) for the contributors who appear in this day. */
function buildContributorMap(
  people: LinkablePerson[],
  contributorIds: string[],
): Map<string, ContributorInfo> {
  const want = new Set(contributorIds);
  const map = new Map<string, ContributorInfo>();
  for (const p of people) {
    if (!want.has(p.id)) continue;
    map.set(p.id, {
      id: p.id,
      name: p.name,
      slug: p.slug,
      // The people table has no `role` column; the byline suffix is the beat label.
      role: getBeatLabel(p.beat),
      beat: p.beat ?? null,
      birth: p.birth ?? null,
      death: p.death ?? null,
      tagline: p.tagline ?? null,
    });
  }
  return map;
}

function collectContributorIds(data: Awaited<ReturnType<typeof getDayPageData>>) {
  if (!data) return [];
  const ids = new Set<string>();

  const allSections = [
    data.resolved.overview,
    data.resolved.news,
    data.resolved.chapter,
    data.resolved.debats.music,
    data.resolved.debats.theater,
    data.resolved.debats.art,
    data.resolved.debats.literature,
    data.resolved.art_exhibitions,
    data.resolved.science,
    data.resolved.galignani,
  ];

  for (const section of allSections) {
    for (const item of section) {
      if (item.kind === "text" && item.contributor_id) {
        ids.add(item.contributor_id);
      }
    }
  }

  return [...ids];
}

// ---------------------------------------------------------------------------
// Valid tab IDs
// ---------------------------------------------------------------------------

const VALID_TABS: TabId[] = [
  "chapter", "paris", "paper",
  "overview", "debats", "art", "science", "original", "translated", "galignani",
];

function parseTab(raw: string | undefined): TabId {
  if (raw && VALID_TABS.includes(raw as TabId)) return raw as TabId;
  return "chapter";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: PageProps) {
  const { date } = await params;
  const installment = getByDate(date);
  if (!installment) return { title: "Not found" };
  return {
    title: `${date} · Journal des Débats`,
    description: installment.label,
  };
}

export default async function DayPage({ params, searchParams }: PageProps) {
  const { date } = await params;
  const { tab: tabParam } = await searchParams;

  const installment = getByDate(date);
  if (!installment) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [data, completedDates] = await Promise.all([
    getDayPageData(date),
    getCompletedDates(),
  ]);

  if (!data) notFound();

  const prev = getPrev(date);
  const next = getNext(date);

  const contributorIds = collectContributorIds(data);
  const people = await listLinkablePeople();
  const contributors = buildContributorMap(people, contributorIds);

  const activeTab = parseTab(tabParam);

  // Local translation runner: enabled only when something can run on this
  // machine (dev) or when explicitly flagged. The Translate button is shown
  // only when this is true.
  const localRunnerEnabled =
    process.env.NODE_ENV === "development" ||
    process.env.LOCAL_TRANSLATION_RUNNER === "1";

  // Latest translation run for the admin status line (admin-only; RLS also
  // guards the table, and we skip the query entirely for non-admins).
  let translationRun: TranslationRunStatus | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profile?.role === "admin") {
      const { data: run } = await supabase
        .from("translation_runs")
        .select("status, created_at, finished_at, error")
        .eq("installment_date", date)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (run) {
        translationRun = {
          status: run.status as TranslationRunStatus["status"],
          createdAt: run.created_at as string,
          finishedAt: (run.finished_at as string | null) ?? null,
          error: (run.error as string | null) ?? null,
        };
      }
    }
  }

  return (
    <Suspense>
      <DayPageView
        data={data}
        installment={installment}
        prevDate={prev?.date ?? null}
        nextDate={next?.date ?? null}
        initialCompleted={completedDates.includes(date)}
        isSignedIn={!!user}
        initialTab={activeTab}
        contributors={contributors}
        localRunnerEnabled={localRunnerEnabled}
        translationRun={translationRun}
      />
    </Suspense>
  );
}
