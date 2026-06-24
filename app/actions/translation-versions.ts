"use server";

/**
 * Server actions for translation version history (compare, promote, delete).
 *
 * Kept in a dedicated module so the file exports only async functions, as
 * required by Next.js "use server" at file scope.
 */

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/admin/assert-admin";
import {
  getSectionItems,
  loadDoc,
  saveDoc,
  setSectionItems,
} from "@/lib/admin/day-content-io";
import { splitFrenchPages } from "@/lib/translate/french-pages";
import type { DayContentSection } from "@/lib/types/day-content-section";
import type { TextItem } from "@/lib/types/content";
import type { TranslationVersionMeta } from "@/lib/types/translation-versions";
import { createAdminClient } from "@/lib/supabase/server";

export async function getTranslationVersions(
  date: string,
  section: string,
  slotKey: string,
): Promise<TranslationVersionMeta[]> {
  await assertAdmin();
  const db = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any)
    .from("translation_versions")
    .select(
      "id, slot_key, section, translation_origin, model_used, translator, " +
        "translation_source_url, source_text_url, fr_intermediate_r2_key, " +
        "text_r2_key, cost_usd, low_confidence, admin_notes, translated_at, " +
        "attribution, license",
    )
    .eq("installment_date", date)
    .eq("section", section)
    .eq("slot_key", slotKey)
    .order("translated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch translation versions: ${error.message}`);
  }
  return (data ?? []) as TranslationVersionMeta[];
}

export async function getVersionText(r2Key: string): Promise<string> {
  await assertAdmin();
  const { getR2Text } = await import("@/lib/r2-server");
  const text = await getR2Text(r2Key);
  if (text === null) {
    throw new Error(`R2 object not found: ${r2Key}`);
  }
  return text;
}

export async function getVersionPageFrench(
  r2Key: string,
  pageNumber: number,
): Promise<string> {
  await assertAdmin();
  const { getR2Text } = await import("@/lib/r2-server");
  const text = await getR2Text(r2Key);
  if (text === null) {
    throw new Error(`R2 object not found: ${r2Key}`);
  }
  const chunk = splitFrenchPages(text).find((c) => c.pageNumber === pageNumber);
  return chunk ? chunk.text : text;
}

export async function promoteTranslationVersion(
  versionId: string,
  date: string,
  section: DayContentSection,
  slotKey: string,
): Promise<{ ok: true }> {
  await assertAdmin();
  const db = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: version, error: vErr } = await (db as any)
    .from("translation_versions")
    .select("*")
    .eq("id", versionId)
    .single();
  if (vErr || !version) {
    throw new Error(`Version not found: ${versionId}`);
  }

  const doc = await loadDoc(date);
  const sectionItems = getSectionItems(doc, section);
  const liveItem = sectionItems.find(
    (i): i is TextItem => i.kind === "text" && i.slot_key === slotKey,
  );

  if (liveItem && !liveItem.translation_version_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from("translation_versions").insert({
      installment_date: date,
      section,
      slot_key: slotKey,
      text_r2_key: liveItem.text_r2_key,
      source: liveItem.source,
      original_date: liveItem.original_date,
      gallica_url: liveItem.gallica_url,
      license: liveItem.license,
      attribution: liveItem.attribution,
      contributor_id: liveItem.contributor_id ?? null,
      translation_origin: liveItem.translation_origin ?? "machine_claude",
      model_used: liveItem.translation_model ?? null,
      translator: liveItem.translator ?? null,
      translation_source_url: liveItem.translation_source_url ?? null,
      source_text_url: liveItem.source_text_url ?? null,
      fr_intermediate_r2_key: liveItem.fr_intermediate_r2_key ?? null,
      cost_usd: null,
      low_confidence: liveItem.low_confidence ?? false,
      admin_notes: `[Snapshot of legacy live item displaced by promotion of version ${versionId}]`,
    });
  }

  const updatedItem: TextItem = {
    kind: "text",
    text_r2_key: version.text_r2_key,
    source: version.source,
    original_date: version.original_date ?? date,
    gallica_url: version.gallica_url,
    license: version.license,
    attribution: version.attribution,
    contributor_id: version.contributor_id ?? undefined,
    slot_key: slotKey,
    translation_origin: version.translation_origin,
    translation_model: version.model_used ?? undefined,
    translator: version.translator ?? undefined,
    translation_source_url: version.translation_source_url ?? undefined,
    source_text_url: version.source_text_url ?? undefined,
    fr_intermediate_r2_key: version.fr_intermediate_r2_key ?? undefined,
    low_confidence: version.low_confidence || undefined,
    admin_notes: version.admin_notes ?? undefined,
    translation_version_id: versionId,
  };

  const matched = sectionItems.some(
    (i) => i.kind === "text" && i.slot_key === slotKey,
  );
  const newItems = matched
    ? sectionItems.map((item) =>
        item.kind === "text" && item.slot_key === slotKey ? updatedItem : item,
      )
    : [...sectionItems, updatedItem];

  await saveDoc(date, setSectionItems(doc, section, newItems));
  revalidatePath(`/day/${date}`);
  return { ok: true };
}

export async function deleteTranslationVersion(
  id: string,
): Promise<{ ok: true }> {
  await assertAdmin();
  const db = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db as any)
    .from("translation_versions")
    .delete()
    .eq("id", id);
  if (error) {
    throw new Error(`Failed to delete translation version: ${error.message}`);
  }
  return { ok: true };
}
