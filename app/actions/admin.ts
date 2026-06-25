"use server";

/**
 * app/actions/admin.ts
 *
 * All admin write actions for the inline admin mode.
 * Every action: asserts admin session, Zod-validates, writes base tables / R2.
 * Callers call router.refresh() after each action to re-render from live SSR data.
 * RLS admin write policies are the real enforcement; the UI toggle is convenience.
 *
 * Sprint 9 adds translateDay / visionTranscribe to this same module.
 */

import { spawn } from "node:child_process";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertAdmin } from "@/lib/admin/assert-admin";
import {
  getSectionItems,
  loadDoc,
  saveDoc,
  setSectionItems,
} from "@/lib/admin/day-content-io";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { putR2Object, putR2Text, r2PublicUrl } from "@/lib/r2-server";
import {
  DocItemSchema,
  type DocItem,
  type TextItem,
} from "@/lib/types/content";
import { recomputeGraphLayout } from "@/lib/graph-recompute";
import {
  MEDIA_KINDS,
  type MediaKind,
  type MediaAssetSearchResult,
} from "@/lib/types/media";
import type { DayContentSection } from "@/lib/types/day-content-section";
import { texteBrutR2Key, altoR2Key } from "@/lib/translate/french-source";
import type { ImageItem } from "@/lib/types/content";

// ---------------------------------------------------------------------------
// Day content item actions
// ---------------------------------------------------------------------------

/**
 * Add or replace a DocItem in a day section.
 * For text items, pass textBody to upload to R2; the text_r2_key is generated server-side.
 * Pass itemIndex = null to append; pass an index to replace.
 */
export async function upsertDayContentItem(
  date: string,
  section: DayContentSection,
  item: DocItem,
  textBody: string | null,
  itemIndex: number | null,
): Promise<{ ok: true }> {
  await assertAdmin();
  let finalItem = DocItemSchema.parse(item);

  if (finalItem.kind === "text" && textBody !== null) {
    const r2Key = `admin/day/${date}/${section.replace(".", "/")}/${crypto.randomUUID()}.txt`;
    await putR2Text(r2Key, textBody);
    finalItem = { ...finalItem, text_r2_key: r2Key };
  }

  // Guard: a text item must point at a real R2 object. This only triggers if a
  // new text item is submitted without a body (the editor blocks this, but the
  // guard prevents a corrupt "__pending__" key from ever being persisted).
  if (finalItem.kind === "text" && finalItem.text_r2_key === "__pending__") {
    throw new Error("Text item requires a prose body before it can be saved.");
  }

  const doc = await loadDoc(date);
  const items = getSectionItems(doc, section);
  const newItems =
    itemIndex === null
      ? [...items, finalItem]
      : items.map((it, i) => (i === itemIndex ? finalItem : it));

  await saveDoc(date, setSectionItems(doc, section, newItems));
  revalidatePath(`/day/${date}`);
  return { ok: true };
}

export async function deleteDayContentItem(
  date: string,
  section: DayContentSection,
  itemIndex: number,
): Promise<{ ok: true }> {
  await assertAdmin();
  const doc = await loadDoc(date);
  const items = getSectionItems(doc, section);
  const newItems = items.filter((_, i) => i !== itemIndex);
  await saveDoc(date, setSectionItems(doc, section, newItems));
  revalidatePath(`/day/${date}`);
  return { ok: true };
}

export async function reorderDayContentItems(
  date: string,
  section: DayContentSection,
  newOrder: DocItem[],
): Promise<{ ok: true }> {
  await assertAdmin();
  const validated = z.array(DocItemSchema).parse(newOrder);
  const doc = await loadDoc(date);
  await saveDoc(date, setSectionItems(doc, section, validated));
  revalidatePath(`/day/${date}`);
  return { ok: true };
}

/**
 * Mark an admin note resolved on a text item by slot_key.
 */
export async function resolveAdminNote(
  date: string,
  section: DayContentSection,
  itemIndex: number,
): Promise<{ ok: true }> {
  await assertAdmin();
  const doc = await loadDoc(date);
  const items = getSectionItems(doc, section);
  const item = items[itemIndex];
  if (!item || item.kind !== "text") {
    throw new Error(`No text item at index ${itemIndex} in ${section}.`);
  }
  const updatedItem = {
    ...item,
    admin_notes: undefined,
    low_confidence: undefined,
  };
  const newItems = items.map((it, i) => (i === itemIndex ? updatedItem : it));
  await saveDoc(date, setSectionItems(doc, section, newItems));
  revalidatePath(`/day/${date}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Media assets
// ---------------------------------------------------------------------------

const MediaAssetUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(MEDIA_KINDS),
  title: z.string().nullable(),
  caption: z.string().nullable(),
  r2_key: z.string().nullable(),
  source_url: z.string().nullable(),
  download_blocked: z.boolean().default(false),
  download_blocked_reason: z.string().nullable(),
  license: z.string().nullable(),
  attribution: z.string().nullable(),
  source: z.string().nullable(),
  tags: z.array(z.string()).default([]),
});

export async function upsertMediaAsset(
  data: z.infer<typeof MediaAssetUpsertSchema>,
): Promise<{ id: string }> {
  await assertAdmin();
  const validated = MediaAssetUpsertSchema.parse(data);
  const db = createAdminClient();

  if (validated.id) {
    const { error } = await db
      .from("media_assets")
      .update(validated)
      .eq("id", validated.id);
    if (error)
      throw new Error(`Failed to update media_asset: ${error.message}`);
    return { id: validated.id };
  }

  const { data: row, error } = await db
    .from("media_assets")
    .insert(validated)
    .select("id")
    .single();
  if (error || !row)
    throw new Error(`Failed to insert media_asset: ${error?.message}`);
  return { id: row.id };
}

export async function uploadMediaToR2(
  filename: string,
  base64: string,
  contentType: string,
  kind: MediaKind,
): Promise<{ id: string; r2_key: string }> {
  await assertAdmin();
  const bytes = Buffer.from(base64, "base64");
  const r2Key = `media/${kind}/${crypto.randomUUID()}-${filename.replace(/[^a-z0-9._-]/gi, "_")}`;
  await putR2Object(r2Key, bytes, contentType);

  const db = createAdminClient();
  const { data: row, error } = await db
    .from("media_assets")
    .insert({
      kind,
      r2_key: r2Key,
      source_url: null,
      download_blocked: false,
      download_blocked_reason: null,
      license: null,
      attribution: null,
      source: null,
      title: filename,
      caption: null,
      tags: [],
    })
    .select("id")
    .single();
  if (error || !row)
    throw new Error(
      `Failed to insert media_asset after upload: ${error?.message}`,
    );
  return { id: row.id, r2_key: r2Key };
}

export async function searchMediaAssets(
  query: string,
  kinds?: string[],
): Promise<MediaAssetSearchResult[]> {
  await assertAdmin();
  const db = createAdminClient();

  let qb = db
    .from("media_assets")
    .select("id, kind, r2_key, source_url, title, caption, attribution")
    .order("created_at", { ascending: false })
    .limit(48);

  if (kinds && kinds.length > 0) qb = qb.in("kind", kinds);
  // Strip characters that have meaning in PostgREST's .or()/ilike grammar
  // (commas, parens, wildcards, escapes) so a search term can't break or be
  // injected into the filter expression.
  const safeQuery = query.replace(/[,()*%\\:"]/g, " ").trim();
  if (safeQuery) {
    qb = qb.or(
      `title.ilike.%${safeQuery}%,attribution.ilike.%${safeQuery}%,caption.ilike.%${safeQuery}%`,
    );
  }

  const { data, error } = await qb;
  if (error) throw new Error(`Failed to search media_assets: ${error.message}`);

  return (data ?? []).map((a) => ({
    ...a,
    thumbnail_url: a.r2_key ? r2PublicUrl(a.r2_key) : a.source_url,
  }));
}

export async function upsertAssetLink(data: {
  media_asset_id: string;
  target_type: "installment" | "person" | "chapter";
  target_key: string;
  tab?: string | null;
  section?: string | null;
  sort_order?: number;
}): Promise<{ ok: true }> {
  await assertAdmin();
  const db = createAdminClient();
  const { error } = await db.from("asset_links").upsert({
    ...data,
    sort_order: data.sort_order ?? 0,
  });
  if (error) throw new Error(`Failed to upsert asset_link: ${error.message}`);
  return { ok: true };
}

/**
 * Update only a person's bio markdown (avoids needing to know all other fields).
 */
export async function updatePersonBio(
  personId: string,
  slug: string,
  bioText: string,
): Promise<{ ok: true }> {
  await assertAdmin();
  const r2Key = `people/${slug}/bio.md`;
  await putR2Text(r2Key, bioText);
  const db = createAdminClient();
  const { error } = await db
    .from("people")
    .update({ bio_md_r2_key: r2Key })
    .eq("id", personId);
  if (error) throw new Error(`Failed to update bio: ${error.message}`);
  revalidatePath(`/people/${slug}`);
  return { ok: true };
}

/**
 * Update only a person's autobio markdown.
 */
export async function updatePersonAutobio(
  personId: string,
  slug: string,
  autobioText: string,
): Promise<{ ok: true }> {
  await assertAdmin();
  const r2Key = `people/${slug}/autobio.md`;
  await putR2Text(r2Key, autobioText);
  const db = createAdminClient();
  const { error } = await db
    .from("people")
    .update({ autobio_md_r2_key: r2Key })
    .eq("id", personId);
  if (error) throw new Error(`Failed to update autobio: ${error.message}`);
  revalidatePath(`/people/${slug}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const PersonUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(["contributor", "figure", "royalty"]),
  beat: z
    .enum([
      "music",
      "drama",
      "art",
      "literature",
      "science",
      "politics",
      "foreign",
      "economics",
      "direction",
    ])
    .nullable(),
  birth: z.number().int().nullable(),
  death: z.number().int().nullable(),
  is_contributor: z.boolean().default(false),
  bio_md_r2_key: z.string().nullable(),
  autobio_md_r2_key: z.string().nullable(),
  portrait_media_asset_id: z.string().uuid().nullable(),
  sources: z.array(z.unknown()).default([]),
});

export async function upsertPerson(
  data: z.infer<typeof PersonUpsertSchema>,
  bioText?: string,
  autobioText?: string,
): Promise<{ id: string }> {
  await assertAdmin();
  const validated = PersonUpsertSchema.parse(data);
  const db = createAdminClient();

  let bio_md_r2_key = validated.bio_md_r2_key;
  let autobio_md_r2_key = validated.autobio_md_r2_key;

  if (bioText !== undefined) {
    bio_md_r2_key = `people/${validated.slug}/bio.md`;
    await putR2Text(bio_md_r2_key, bioText);
  }
  if (autobioText !== undefined) {
    autobio_md_r2_key = `people/${validated.slug}/autobio.md`;
    await putR2Text(autobio_md_r2_key, autobioText);
  }

  const payload = { ...validated, bio_md_r2_key, autobio_md_r2_key };

  if (validated.id) {
    const { error } = await db
      .from("people")
      .update(payload)
      .eq("id", validated.id);
    if (error) throw new Error(`Failed to update person: ${error.message}`);
    revalidatePath(`/people/${validated.slug}`);
    return { id: validated.id };
  }

  const { data: row, error } = await db
    .from("people")
    .insert(payload)
    .select("id")
    .single();
  if (error || !row)
    throw new Error(`Failed to insert person: ${error?.message}`);
  revalidatePath(`/people/${validated.slug}`);
  return { id: row.id };
}

// ---------------------------------------------------------------------------
// Life events
// ---------------------------------------------------------------------------

const LifeEventUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  person_id: z.string().uuid(),
  event_date: z.string().nullable(),
  precision: z.enum(["day", "month", "year"]).nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  kind: z.enum([
    "birth",
    "death",
    "work",
    "appointment",
    "award",
    "publication",
    "premiere",
    "discovery",
    "personal",
  ]),
  sources: z.array(z.string()).default([]),
});

export async function upsertLifeEvent(
  data: z.infer<typeof LifeEventUpsertSchema>,
): Promise<{ id: string }> {
  await assertAdmin();
  const validated = LifeEventUpsertSchema.parse(data);
  const db = createAdminClient();

  if (validated.id) {
    const { error } = await db
      .from("life_events")
      .update(validated)
      .eq("id", validated.id);
    if (error) throw new Error(`Failed to update life_event: ${error.message}`);
    return { id: validated.id };
  }

  const { data: row, error } = await db
    .from("life_events")
    .insert(validated)
    .select("id")
    .single();
  if (error || !row)
    throw new Error(`Failed to insert life_event: ${error?.message}`);
  return { id: row.id };
}

export async function deleteLifeEvent(id: string): Promise<{ ok: true }> {
  await assertAdmin();
  const db = createAdminClient();
  const { error } = await db.from("life_events").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete life_event: ${error.message}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Relationships
// ---------------------------------------------------------------------------

const RelationshipUpsertSchema = z.object({
  id: z.string().uuid().optional(),
  from_person: z.string().uuid(),
  to_person: z.string().uuid(),
  kind: z.enum([
    "family",
    "romantic",
    "friend",
    "rival",
    "mentor",
    "collaborator",
    "patron",
    "royalty",
    "professional",
  ]),
  label: z.string().nullable(),
  description: z.string().nullable(),
  start_year: z.number().int().nullable(),
  end_year: z.number().int().nullable(),
  sources: z.array(z.string()).default([]),
});

export async function upsertRelationship(
  data: z.infer<typeof RelationshipUpsertSchema>,
): Promise<{ id: string }> {
  await assertAdmin();
  const validated = RelationshipUpsertSchema.parse(data);
  const db = createAdminClient();

  if (validated.id) {
    const { error } = await db
      .from("relationships")
      .update(validated)
      .eq("id", validated.id);
    if (error)
      throw new Error(`Failed to update relationship: ${error.message}`);
    return { id: validated.id };
  }

  const { data: row, error } = await db
    .from("relationships")
    .insert(validated)
    .select("id")
    .single();
  if (error || !row)
    throw new Error(`Failed to insert relationship: ${error?.message}`);
  return { id: row.id };
}

export async function deleteRelationship(id: string): Promise<{ ok: true }> {
  await assertAdmin();
  const db = createAdminClient();
  const { error } = await db.from("relationships").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete relationship: ${error.message}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Contributor attributions
// ---------------------------------------------------------------------------

const ContribAttrSchema = z.object({
  person_id: z.string().uuid(),
  installment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  section: z.string().min(1),
});

export async function upsertContributorAttribution(
  data: z.infer<typeof ContribAttrSchema>,
): Promise<{ ok: true }> {
  await assertAdmin();
  const validated = ContribAttrSchema.parse(data);
  const db = createAdminClient();
  const { error } = await db
    .from("contributor_attributions")
    .upsert(validated, { onConflict: "person_id,installment_date,section" });
  if (error)
    throw new Error(
      `Failed to upsert contributor_attribution: ${error.message}`,
    );
  return { ok: true };
}

export async function deleteContributorAttribution(
  personId: string,
  installmentDate: string,
  section: string,
): Promise<{ ok: true }> {
  await assertAdmin();
  const db = createAdminClient();
  const { error } = await db
    .from("contributor_attributions")
    .delete()
    .eq("person_id", personId)
    .eq("installment_date", installmentDate)
    .eq("section", section);
  if (error)
    throw new Error(
      `Failed to delete contributor_attribution: ${error.message}`,
    );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Editorial blocks
// ---------------------------------------------------------------------------

export async function upsertEditorialBlock(
  key: string,
  title: string,
  bodyMd: string,
): Promise<{ ok: true }> {
  await assertAdmin();
  const r2Key = `editorial/${key}.md`;
  await putR2Text(r2Key, bodyMd);

  const db = createAdminClient();
  const { error } = await db
    .from("editorial_blocks")
    .upsert({ key, title, body_md_r2_key: r2Key }, { onConflict: "key" });
  if (error)
    throw new Error(`Failed to upsert editorial_block: ${error.message}`);
  revalidatePath("/timeline");
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Graph edit actions (Sprint 7)
// ---------------------------------------------------------------------------

/**
 * Write a person to the graph and recompute all layout variants.
 * Called by GraphEditOverlay (UI defined in the Graph Engine plan).
 */
export async function upsertGraphPerson(
  data: z.infer<typeof PersonUpsertSchema>,
): Promise<{ id: string }> {
  const result = await upsertPerson(data);
  await recomputeGraphLayout();
  revalidatePath("/debats");
  return result;
}

/**
 * Write a relationship and recompute all layout variants.
 */
export async function upsertGraphRelationship(
  data: z.infer<typeof RelationshipUpsertSchema>,
): Promise<{ id: string }> {
  const result = await upsertRelationship(data);
  await recomputeGraphLayout();
  revalidatePath("/debats");
  return result;
}

export async function deleteGraphRelationship(
  id: string,
): Promise<{ ok: true }> {
  const result = await deleteRelationship(id);
  await recomputeGraphLayout();
  revalidatePath("/debats");
  return result;
}

/**
 * Manually trigger a full graph layout recompute across all variants.
 */
export async function triggerGraphRecompute(): Promise<{ variants: number }> {
  await assertAdmin();
  const results = await recomputeGraphLayout();
  revalidatePath("/debats");
  return { variants: results.length };
}

// ---------------------------------------------------------------------------
// Local translation runner (Sprint 9 execution harness)
//
// Enqueues a per-day translation and spawns the local CLI runner
// (scripts/translate/translate-day.ts) detached, so the heavy Claude work runs
// on the admin's own machine without a serverless timeout. The button that
// calls this is labelled "Re-translate day locally" and is shown only when this
// runner is enabled. Fire-and-forget: the admin refreshes to see results.
// ---------------------------------------------------------------------------

/**
 * Whether the local translation runner is available. It dispatches to a local
 * CLI process, so it only makes sense when something is running on this machine
 * (dev), or when explicitly enabled via env. Never enabled on a plain
 * production deploy, where there is no local process to run the work.
 */
function isLocalTranslationRunnerEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.LOCAL_TRANSLATION_RUNNER === "1"
  );
}

export type TranslationEngine = "sonnet" | "opus" | "haiku";

const CLAUDE_MODEL_BY_ENGINE: Record<TranslationEngine, string> = {
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-8",
  haiku: "claude-haiku-4-5",
};

export async function requestDayTranslation(
  date: string,
  engine: TranslationEngine = "sonnet",
): Promise<{ accepted: boolean; runId?: string; reason?: string }> {
  await assertAdmin();

  if (!isLocalTranslationRunnerEnabled()) {
    throw new Error(
      "Local translation runner is disabled. It runs the translation on your own " +
        "machine; set LOCAL_TRANSLATION_RUNNER=1 (or run in development) to enable it.",
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date: ${date}. Expected YYYY-MM-DD.`);
  }

  if (engine !== "sonnet" && engine !== "opus" && engine !== "haiku") {
    throw new Error(`Invalid engine: ${engine}. Expected sonnet, opus, or haiku.`);
  }

  const db = createAdminClient();

  // Double-run guard: don't enqueue if a run is already pending for this day.
  const { data: active } = await db
    .from("translation_runs")
    .select("id")
    .eq("installment_date", date)
    .in("status", ["queued", "running"])
    .limit(1)
    .maybeSingle();
  if (active?.id) {
    return {
      accepted: false,
      runId: active.id as string,
      reason: "A run is already queued or in progress for this day.",
    };
  }

  // Best-effort: record which admin requested the run (column is nullable).
  let requestedBy: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    requestedBy = data.user?.id ?? null;
  } catch {
    requestedBy = null;
  }

  const { data: row, error } = await db
    .from("translation_runs")
    .insert({
      installment_date: date,
      status: "queued",
      requested_by: requestedBy,
    })
    .select("id")
    .single();
  if (error || !row?.id) {
    throw new Error(
      `Failed to enqueue translation run: ${error?.message ?? "no id returned"}`,
    );
  }
  const runId = row.id as string;

  // Spawn the local CLI runner detached so it survives dev hot reloads and the
  // action returns immediately. Inherits env (Supabase service role, Anthropic
  // key, TRANSLATION_MODEL, …) so the child can do its work.
  const child = spawn(
    "npx",
    [
      "tsx",
      "scripts/translate/translate-day.ts",
      `--date=${date}`,
      `--run-id=${runId}`,
      `--model=${CLAUDE_MODEL_BY_ENGINE[engine]}`,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      detached: true,
      stdio: "ignore",
    },
  );
  // If the process can't even start, record it so the day page shows the error.
  child.on("error", (e) => {
    void db
      .from("translation_runs")
      .update({
        status: "failed",
        error: `spawn failed: ${e.message}`,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  });
  child.unref();

  revalidatePath(`/day/${date}`);
  return { accepted: true, runId };
}

// ---------------------------------------------------------------------------
// Sprint 9 — Translation actions
// ---------------------------------------------------------------------------

/**
 * Run the full day translation pipeline synchronously (admin-only).
 *
 * For the async local-runner workflow, use requestDayTranslation() above.
 * This action is for programmatic use (scripts, testing, or a direct "translate
 * now and wait" flow if added later to the UI).
 */
export async function translateDay(
  date: string,
): Promise<import("@/lib/translate/pipeline").TranslationRunSummary> {
  await assertAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date: ${date}. Expected YYYY-MM-DD.`);
  }
  const { runDayTranslation } = await import("@/lib/translate/pipeline");
  const summary = await runDayTranslation(date, (msg) => {
    console.log(`[translateDay] ${msg}`);
  });
  revalidatePath(`/day/${date}`);
  return summary;
}

/**
 * On-demand vision OCR transcription for a page scan.
 *
 * Sends the IIIF page image to the vision model and stores the faithful French
 * transcription as an alternate fr-intermediate source (NOT a translation_versions
 * row directly). The admin then translates it to produce a comparable machine_claude
 * version for side-by-side review.
 *
 * Never runs in the batch pipeline; manual only.
 */
export async function visionTranscribe(
  date: string,
  pageIndex: number,
): Promise<{ r2_key: string; char_count: number; model: string }> {
  await assertAdmin();

  const db = createAdminClient();
  const doc = await loadDoc(date);

  const pageItem = doc.original_pages?.[pageIndex];
  if (!pageItem) {
    throw new Error(
      `No page scan at index ${pageIndex} for ${date}. ` +
        `Run scripts/gallica/pull-scans.ts first.`,
    );
  }

  // Load image data from R2
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assetRow, error: assetErr } = await (db as any)
    .from("media_assets")
    .select("r2_key, source_url")
    .eq("id", pageItem.media_asset_id)
    .single();

  if (assetErr || !assetRow) {
    throw new Error(
      `media_asset not found for page ${pageIndex}: ${assetErr?.message ?? "no data"}`,
    );
  }

  const { getR2Object, putR2Text } = await import("@/lib/r2-server");

  let imageBase64: string;
  let mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg";

  if (assetRow.r2_key) {
    const buf = await getR2Object(assetRow.r2_key as string);
    if (!buf) {
      throw new Error(`R2 object not found: ${assetRow.r2_key}`);
    }
    imageBase64 = buf.toString("base64");
    if ((assetRow.r2_key as string).endsWith(".png")) mediaType = "image/png";
    else if ((assetRow.r2_key as string).endsWith(".webp"))
      mediaType = "image/webp";
  } else {
    throw new Error(
      `No R2 key for page ${pageIndex} asset. ` +
        `Only R2-stored scans are supported for vision OCR.`,
    );
  }

  const { transcribePageImage, VISION_MODEL } =
    await import("@/lib/llm/translate");

  const result = await transcribePageImage(imageBase64, mediaType, {
    date,
    page: pageIndex,
  });

  const r2Key = `${date}/fr-intermediate/vision-page${pageIndex}.txt`;
  await putR2Text(r2Key, result.french_text);

  console.log(
    `[visionTranscribe] ${date} page ${pageIndex}: ${result.french_text.length} chars, ` +
      `model=${result.model}, cost=$${result.cost_usd.toFixed(4)}`,
  );

  return {
    r2_key: r2Key,
    char_count: result.french_text.length,
    model: VISION_MODEL,
  };
}

// ---------------------------------------------------------------------------
// Manual Gallica recovery (admin-mode escape hatch for outages)
// ---------------------------------------------------------------------------

/**
 * Wire a manually-uploaded image (already in R2 + media_assets via
 * uploadMediaToR2) into doc.original_pages at pageIndex. Replaces an
 * existing page or appends the next one; refuses to leave a gap.
 */
export async function setOriginalPageImage(
  date: string,
  pageIndex: number,
  mediaAssetId: string,
  caption?: string,
): Promise<{ ok: true }> {
  await assertAdmin();
  const doc = await loadDoc(date);
  if (pageIndex > doc.original_pages.length) {
    throw new Error(
      `Cannot set page ${pageIndex + 1}: only ${doc.original_pages.length} page(s) exist for ${date}. Add earlier pages first.`,
    );
  }
  const item: ImageItem = {
    kind: "image",
    media_asset_id: mediaAssetId,
    caption: caption ?? "",
  };
  const original_pages = [...doc.original_pages];
  original_pages[pageIndex] = item;
  await saveDoc(date, { ...doc, original_pages });
  revalidatePath(`/day/${date}`);
  return { ok: true };
}

/** Wire a manually-uploaded image into doc.feuilleton_strip. */
export async function setFeuilletonStripImage(
  date: string,
  mediaAssetId: string,
  caption?: string,
): Promise<{ ok: true }> {
  await assertAdmin();
  const doc = await loadDoc(date);
  const item: ImageItem = {
    kind: "image",
    media_asset_id: mediaAssetId,
    caption: caption ?? "",
  };
  await saveDoc(date, { ...doc, feuilleton_strip: item });
  revalidatePath(`/day/${date}`);
  return { ok: true };
}

/**
 * Write manually-pasted French source text (copied from Gallica's texteBrut
 * or ALTO endpoint in the admin's own browser, where bot-checks don't apply)
 * to the matching R2 key. No doc mutation — loadCachedFrench reads these
 * keys directly, so translate-day picks this up automatically next run.
 */
export async function uploadFrenchSourceText(
  date: string,
  tier: "textebrut" | "alto",
  text: string,
): Promise<{ r2_key: string; char_count: number }> {
  await assertAdmin();
  const trimmed = text.trim();
  if (trimmed.length < 50) {
    throw new Error(
      `Pasted text is too short (${trimmed.length} chars) — paste the full page content.`,
    );
  }
  const r2Key = tier === "textebrut" ? texteBrutR2Key(date) : altoR2Key(date);
  await putR2Text(r2Key, trimmed);
  revalidatePath(`/day/${date}`);
  return { r2_key: r2Key, char_count: trimmed.length };
}
