/**
 * lib/progress.ts
 *
 * Per-user reading progress: mark installments complete/incomplete,
 * read all completed dates, and sync last_location / view_pref.
 *
 * All functions require the user to be signed in — they use the
 * authenticated Supabase client (cookies-based session). If called
 * while unauthenticated they will fail gracefully and return null/[].
 */

import { createClient } from "@/lib/supabase/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserProgress {
  completedDates: string[]; // ISO 8601 dates
  lastLocation: string | null; // ISO 8601 date
  viewPref: "horizontal" | "vertical";
}

export interface UserPrefs {
  lastLocation: string | null;
  viewPref: "horizontal" | "vertical";
}

// ---------------------------------------------------------------------------
// Progress reads
// ---------------------------------------------------------------------------

/**
 * Returns all installment dates the current user has marked complete.
 * Returns an empty array when unauthenticated.
 */
export async function getCompletedDates(): Promise<string[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("progress")
    .select("installment_date")
    .eq("user_id", user.id)
    .order("installment_date");

  if (error) {
    console.error("[progress] getCompletedDates:", error.message);
    return [];
  }

  return (data ?? []).map((r) => r.installment_date as string);
}

/**
 * Returns the full user progress bundle: completed dates, last location,
 * and view preference. Returns defaults when unauthenticated.
 */
export async function getUserProgress(): Promise<UserProgress> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { completedDates: [], lastLocation: null, viewPref: "horizontal" };
  }

  const [progressResult, prefsResult] = await Promise.all([
    supabase
      .from("progress")
      .select("installment_date")
      .eq("user_id", user.id)
      .order("installment_date"),
    supabase
      .from("user_prefs")
      .select("last_location, view_pref")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const completedDates = (progressResult.data ?? []).map(
    (r) => r.installment_date as string,
  );
  const prefs = prefsResult.data;

  return {
    completedDates,
    lastLocation: (prefs?.last_location as string | null) ?? null,
    viewPref: (prefs?.view_pref as "horizontal" | "vertical") ?? "horizontal",
  };
}

// ---------------------------------------------------------------------------
// Progress writes
// ---------------------------------------------------------------------------

/**
 * Marks an installment as complete for the current user.
 * No-op if already marked. Silently fails if unauthenticated.
 */
export async function markComplete(date: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("progress")
    .upsert(
      { user_id: user.id, installment_date: date },
      { onConflict: "user_id,installment_date", ignoreDuplicates: true },
    );

  if (error) console.error("[progress] markComplete:", error.message);
}

/**
 * Removes the completion mark for an installment. No-op if not marked.
 * Silently fails if unauthenticated.
 */
export async function markIncomplete(date: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("progress")
    .delete()
    .eq("user_id", user.id)
    .eq("installment_date", date);

  if (error) console.error("[progress] markIncomplete:", error.message);
}

/**
 * Updates the user's last-read location and/or view preference.
 * Pass only the keys you want to change.
 */
export async function updatePrefs(
  prefs: Partial<{ lastLocation: string; viewPref: "horizontal" | "vertical" }>,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const row: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (prefs.lastLocation !== undefined) row.last_location = prefs.lastLocation;
  if (prefs.viewPref !== undefined) row.view_pref = prefs.viewPref;

  const { error } = await supabase
    .from("user_prefs")
    .upsert(row, { onConflict: "user_id" });

  if (error) console.error("[progress] updatePrefs:", error.message);
}
