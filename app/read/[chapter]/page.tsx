import { notFound } from "next/navigation";
import {
  getChapter,
  getNextChapter,
  getPrevChapter,
  getChapterCount,
  chapterTextR2Key,
  stripChapterHeading,
} from "@/lib/book";
import { getR2Text } from "@/lib/r2-server";
import { createClient } from "@/lib/supabase/server";
import ReadingView from "@/components/read/ReadingView";

interface PageProps {
  params: Promise<{ chapter: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { chapter: slug } = await params;
  const chapter = getChapter(slug);
  if (!chapter) return { title: "Not found" };
  return {
    title: `${chapter.num}. ${chapter.title} — Le Comte de Monte-Cristo`,
    description: `Read Chapter ${chapter.num} of The Count of Monte Cristo: ${chapter.title}.`,
  };
}

export default async function ReadChapterPage({ params }: PageProps) {
  const { chapter: slug } = await params;
  const chapter = getChapter(slug);
  if (!chapter) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const prev = getPrevChapter(chapter.num);
  const next = getNextChapter(chapter.num);
  // One chapter further out in each direction. Only their refs are needed —
  // they fill the neighbour layers' own nav rows so links don't pop in late.
  const prevPrev = prev ? getPrevChapter(prev.num) : null;
  const nextNext = next ? getNextChapter(next.num) : null;

  // Load the current chapter plus its neighbours in parallel. The neighbours
  // are rendered underneath the current page so the slide-to-turn animation
  // reveals real content instead of a blank sheet.
  const [text, prevText, nextText] = (
    await Promise.all([
      getR2Text(chapterTextR2Key(chapter.num)),
      prev ? getR2Text(chapterTextR2Key(prev.num)) : Promise.resolve(null),
      next ? getR2Text(chapterTextR2Key(next.num)) : Promise.resolve(null),
    ])
  ).map(stripChapterHeading) as [
    string | null,
    string | null,
    string | null,
  ];

  return (
    <ReadingView
      chapterNum={chapter.num}
      chapterTitle={chapter.title}
      chapterIndex={chapter.index}
      totalChapters={getChapterCount()}
      text={text}
      prevText={prevText}
      nextText={nextText}
      prev={prev ? { slug: prev.slug, num: prev.num, title: prev.title } : null}
      next={next ? { slug: next.slug, num: next.num, title: next.title } : null}
      prevPrev={
        prevPrev
          ? { slug: prevPrev.slug, num: prevPrev.num, title: prevPrev.title }
          : null
      }
      nextNext={
        nextNext
          ? { slug: nextNext.slug, num: nextNext.num, title: nextNext.title }
          : null
      }
      isSignedIn={!!user}
    />
  );
}
