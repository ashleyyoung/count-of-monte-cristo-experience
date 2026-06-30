/**
 * lib/book-progress.ts
 *
 * Per-user position in the linear novel: which chapter they last read, and
 * which chapter / how many seconds in they last listened. Backs the /read and
 * /listen sections' "resume where you left off" behaviour.
 *
 * All functions require a signed-in user (cookie-based Supabase session). When
 * unauthenticated, reads return null and writes are no-ops.
 */

import type { NarrationLang } from "@/lib/narration";
import { createClient } from "@/lib/supabase/server";

export interface BookProgress {
  lastReadChapter: string | null; // Roman numeral
  lastListenChapter: string | null; // Roman numeral
  lastListenPosition: number; // seconds
  lastListenLang: NarrationLang;
}

const DEFAULT_PROGRESS: BookProgress = {
  lastReadChapter: null,
  lastListenChapter: null,
  lastListenPosition: 0,
  lastListenLang: "en",
};

/**
 * Reads the current user's book progress. Returns defaults (all null/0) when
 * unauthenticated or when the user has no row yet.
 */
export async function getBookProgress(): Promise<BookProgress> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PROGRESS;

  const { data, error } = await supabase
    .from("book_progress")
    .select(
      "last_read_chapter, last_listen_chapter, last_listen_position, last_listen_lang",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[book-progress] getBookProgress:", error.message);
    return DEFAULT_PROGRESS;
  }
  if (!data) return DEFAULT_PROGRESS;

  return {
    lastReadChapter: (data.last_read_chapter as string | null) ?? null,
    lastListenChapter: (data.last_listen_chapter as string | null) ?? null,
    lastListenPosition: (data.last_listen_position as number | null) ?? 0,
    lastListenLang:
      (data.last_listen_lang as NarrationLang | null) ?? "en",
  };
}

interface UpdateInput {
  readChapter?: string;
  listenChapter?: string;
  listenPosition?: number;
  listenLang?: NarrationLang;
}

/**
 * Upserts the current user's book progress. Only the provided fields change.
 * Silently no-ops when unauthenticated.
 */
export async function updateBookProgress(input: UpdateInput): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const row: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (input.readChapter !== undefined)
    row.last_read_chapter = input.readChapter.toUpperCase();
  if (input.listenChapter !== undefined)
    row.last_listen_chapter = input.listenChapter.toUpperCase();
  if (input.listenPosition !== undefined)
    row.last_listen_position = Math.max(0, input.listenPosition);
  if (input.listenLang !== undefined) row.last_listen_lang = input.listenLang;

  const { error } = await supabase
    .from("book_progress")
    .upsert(row, { onConflict: "user_id" });

  if (error) console.error("[book-progress] updateBookProgress:", error.message);
}
