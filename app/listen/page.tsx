import { getAllChapters, getFirstChapter, getChapter } from "@/lib/book";
import { getBookProgress } from "@/lib/book-progress";
import { createClient } from "@/lib/supabase/server";
import ListenView from "@/components/listen/ListenView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Listen — Le Comte de Monte-Cristo",
  description:
    "Listen to The Count of Monte Cristo end to end — all 117 chapters, narrated, playing continuously.",
};

interface PageProps {
  searchParams: Promise<{ chapter?: string }>;
}

export default async function ListenPage({ searchParams }: PageProps) {
  const { chapter: chapterParam } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const progress = await getBookProgress();

  // Priority for the starting chapter: explicit ?chapter= link, then the
  // resume point from saved progress, then Chapter I.
  const requested = chapterParam ? getChapter(chapterParam) : null;
  const resumed = progress.lastListenChapter
    ? getChapter(progress.lastListenChapter)
    : null;
  const start = requested ?? resumed ?? getFirstChapter();

  // Only honour the saved position when we're actually resuming that chapter
  // (not when the user jumped to a specific chapter via ?chapter=).
  const startPosition =
    !requested && resumed && resumed.num === progress.lastListenChapter
      ? progress.lastListenPosition
      : 0;

  return (
    <ListenView
      chapters={getAllChapters()}
      startChapter={start.num}
      startPosition={startPosition}
      startLang={progress.lastListenLang}
      isSignedIn={!!user}
    />
  );
}
