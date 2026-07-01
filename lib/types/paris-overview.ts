import { z } from "zod";

/** Paris subtab ids that overview sections link to (not "overview" itself). */
export const ParisOverviewSectionIdSchema = z.enum([
  "news",
  "society",
  "scandals",
  "arts",
  "literature",
  "science",
  "music",
  "theatre",
]);

export type ParisOverviewSectionId = z.infer<
  typeof ParisOverviewSectionIdSchema
>;

// ---------------------------------------------------------------------------
// v1 schema (legacy — kept for backward-compat rendering of old data)
// ---------------------------------------------------------------------------

export const ParisOverviewSectionSchema = z.object({
  id: ParisOverviewSectionIdSchema,
  title: z.string().min(1),
  /** One or two short sentences; no bullet points. */
  summary: z.string().min(1),
});

export const NoteworthyItemSchema = z.object({
  text: z.string().min(1),
  /** Which Paris subtab this item came from. Omit if it spans multiple sections. */
  section: ParisOverviewSectionIdSchema.optional(),
});

export type NoteworthyItem = z.infer<typeof NoteworthyItemSchema>;

export const ParisOverviewV1Schema = z.object({
  version: z.literal(1),
  sections: z.array(ParisOverviewSectionSchema),
  noteworthy: z.array(NoteworthyItemSchema),
});

export type ParisOverviewV1 = z.infer<typeof ParisOverviewV1Schema>;

// ---------------------------------------------------------------------------
// v2 schema — lead + flat highlights list
// ---------------------------------------------------------------------------

export const HighlightItemSchema = z.object({
  text: z.string().min(1),
  section: ParisOverviewSectionIdSchema,
});

export type HighlightItem = z.infer<typeof HighlightItemSchema>;

export const ParisOverviewV2Schema = z.object({
  version: z.literal(2),
  /** One sentence capturing the feel/character of the whole issue. */
  lead: z.string().min(1),
  /** 5–8 specific, distinct story teasers, each linking to a subtab. */
  highlights: z.array(HighlightItemSchema),
});

export type ParisOverviewV2 = z.infer<typeof ParisOverviewV2Schema>;

// ---------------------------------------------------------------------------
// Union type + parser
// ---------------------------------------------------------------------------

export type ParisOverview = ParisOverviewV1 | ParisOverviewV2;

/** For backward compat: keep the old export alias pointing at v1. */
export const ParisOverviewSchema = ParisOverviewV1Schema;

/** Strip optional markdown code fences from model output. */
export function extractJsonFromModelOutput(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/m.exec(trimmed);
  if (fence) return fence[1].trim();
  return trimmed;
}

export function parseParisOverview(raw: string): ParisOverview | null {
  try {
    const json = extractJsonFromModelOutput(raw);
    const parsed = JSON.parse(json) as unknown;
    const v2 = ParisOverviewV2Schema.safeParse(parsed);
    if (v2.success) return v2.data;
    const v1 = ParisOverviewV1Schema.safeParse(parsed);
    return v1.success ? v1.data : null;
  } catch {
    return null;
  }
}
