import { createAdminClient } from "@/lib/supabase/server";
import {
  DayDocSchema,
  emptyDayDoc,
  parseDayDoc,
  type DayDoc,
  type DocItem,
} from "@/lib/types/content";
import type { DayContentSection } from "@/lib/types/day-content-section";

export function getSectionItems(
  doc: DayDoc,
  section: DayContentSection,
): DocItem[] {
  switch (section) {
    case "debats.music":
      return doc.debats.music;
    case "debats.theater":
      return doc.debats.theater;
    case "debats.art":
      return doc.debats.art;
    case "debats.literature":
      return doc.debats.literature;
    default:
      return (doc[section as keyof DayDoc] as DocItem[]) ?? [];
  }
}

export function setSectionItems(
  doc: DayDoc,
  section: DayContentSection,
  items: DocItem[],
): DayDoc {
  switch (section) {
    case "debats.music":
      return { ...doc, debats: { ...doc.debats, music: items } };
    case "debats.theater":
      return { ...doc, debats: { ...doc.debats, theater: items } };
    case "debats.art":
      return { ...doc, debats: { ...doc.debats, art: items } };
    case "debats.literature":
      return { ...doc, debats: { ...doc.debats, literature: items } };
    default:
      return { ...doc, [section]: items };
  }
}

export async function loadDoc(date: string): Promise<DayDoc> {
  const db = createAdminClient();
  const { data } = await db
    .from("day_content")
    .select("doc")
    .eq("installment_date", date)
    .single();
  if (!data?.doc) return emptyDayDoc();
  return parseDayDoc(data.doc);
}

export async function saveDoc(date: string, doc: DayDoc): Promise<void> {
  const db = createAdminClient();
  const validated = DayDocSchema.parse(doc);
  const { error } = await db
    .from("day_content")
    .upsert(
      { installment_date: date, doc: validated },
      { onConflict: "installment_date" },
    );
  if (error) throw new Error(`Failed to save day_content: ${error.message}`);
}
