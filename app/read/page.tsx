import { getAllChapters } from "@/lib/book";
import { getBookProgress } from "@/lib/book-progress";
import ChaptersIndex from "@/components/read/ChaptersIndex";

// Resume highlight depends on the signed-in user, so resolve per request.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Table of Contents — Le Comte de Monte-Cristo",
  description:
    "Table of contents for The Count of Monte Cristo — read the novel end to end, chapter by chapter.",
};

/**
 * /read — landing page for the reading section: a table of contents linking to
 * every chapter, with a "continue reading" shortcut to where the reader left
 * off (when signed in).
 */
export default async function ReadIndexPage() {
  const { lastReadChapter } = await getBookProgress();
  return (
    <ChaptersIndex
      chapters={getAllChapters()}
      lastReadChapter={lastReadChapter}
    />
  );
}
