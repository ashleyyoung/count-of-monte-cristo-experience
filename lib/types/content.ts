/**
 * Shared Zod discriminated-union schema for day_content.doc items.
 *
 * Used by:
 *  - The inline admin mode write path (server actions)
 *  - Ingestion scripts (ingest-gutenberg, gallica pipeline, translate pipeline)
 *  - lib/content.ts when reading back a document
 *
 * Rules:
 *  - English-only — no French transcriptions stored or displayed.
 *  - Every field in a variant is required; no optional/overlapping fields.
 *  - Prose always lives on R2 (text_r2_key). No inline body.
 *  - Binary media always lives in media_assets (media_asset_id).
 *  - Only short metadata is inline.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Page sections (translated_pages) — reading-order column-runs with regions
// ---------------------------------------------------------------------------

/**
 * A bounding box on the source page image, in page-percentage coordinates
 * (0–100). Scale-independent so it maps onto any IIIF image size via `pct:`.
 */
export const PageRegionSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

/**
 * One reading-order section of a translated page (a newspaper column-run).
 * `region` locates it on the scan (for hover-to-highlight); `start`/`end` are
 * character offsets into the page's English prose (the text_r2_key object), so
 * the section text is a substring rather than a duplicated body.
 */
export const PageSectionSchema = z.object({
  region: PageRegionSchema,
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export type PageRegion = z.infer<typeof PageRegionSchema>;
export type PageSection = z.infer<typeof PageSectionSchema>;

// ---------------------------------------------------------------------------
// Item variants
// ---------------------------------------------------------------------------

/** English prose — chapter text, Débats translated sections, science, Galignani, etc. */
export const TextItemSchema = z.object({
  kind: z.literal("text"),
  /** R2 key for the English prose object. */
  text_r2_key: z.string().min(1),
  /** Origin publication, e.g. "Journal des Débats" or "Galignani's Messenger". */
  source: z.string().min(1),
  /** Original publication date (ISO 8601 date string, e.g. "1844-08-28"). */
  original_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Link to the original issue on Gallica (provenance). */
  gallica_url: z.string().url(),
  /** Content license, e.g. "Public Domain", "CC BY-SA 4.0". */
  license: z.string().min(1),
  /** Human-readable attribution string. */
  attribution: z.string().min(1),
  /** Denormalized convenience — canonical byline is contributor_attributions. */
  contributor_id: z.string().uuid().optional(),

  // ---------------------------------------------------------------------------
  // Stable identity + translation provenance (Sprint 9)
  // ---------------------------------------------------------------------------

  /**
   * Stable per-item identity key, e.g. "chapter-1" or "debats.music-2".
   * Translation history and re-translation are keyed on this, never on array index.
   * Assigned on first segmentation; reused on re-runs.
   */
  slot_key: z.string().min(1).optional(),

  /**
   * How this translation was produced.
   * "machine_claude" — translated by our configured Claude model.
   * "existing_published" — a curated human/public-domain translation (Berlioz, Gutenberg).
   * "staff_translation" — manually authored by a site contributor.
   */
  translation_origin: z
    .enum(["machine_claude", "existing_published", "staff_translation"])
    .optional(),

  /**
   * Exact model id used to produce this translation (admin-only; never shown publicly).
   * e.g. "claude-opus-4-8".
   */
  translation_model: z.string().optional(),

  /**
   * Human translator credit for existing_published items (shown via <Cite>).
   * e.g. "Michel Austin (hberlioz.com)".
   */
  translator: z.string().optional(),

  /**
   * URL where an existing_published translation was sourced from (shown via <Cite>).
   */
  translation_source_url: z.string().url().optional(),

  /**
   * Public permalink to the untranslated French source (Gallica texteBrut, FMC Project, etc.).
   * Shown via <Cite> as a "read the original French" link.
   */
  source_text_url: z.string().url().optional(),

  /**
   * Admin-only R2 key for the exact French text that was translated.
   * Enables side-by-side FR/EN diff in <TranslationHistory>.
   */
  fr_intermediate_r2_key: z.string().optional(),

  /**
   * Admin-only notes (poor OCR regions, flagged passages, manual overrides).
   * Never rendered to public readers.
   */
  admin_notes: z.string().optional(),

  /**
   * When true, the model self-flagged uncertain passages or the FR source had
   * low OCR quality. Surfaces an <AdminNote> in admin mode only.
   */
  low_confidence: z.boolean().optional(),

  /**
   * FK-by-value to the current translation_versions row for this item.
   * Allows the admin UI to identify and manage the live version.
   */
  translation_version_id: z.string().uuid().optional(),

  /**
   * Reading-order sections of this page, each with its source-image region and
   * the character span it occupies in the English prose. Present on per-page
   * translations (translated_pages) produced section-aware; absent on legacy
   * whole-page translations and on non-page items.
   */
  sections: z.array(PageSectionSchema).optional(),
});

/** An image asset — page scans, feuilleton-strip crop, illustrations, portraits. */
export const ImageItemSchema = z.object({
  kind: z.literal("image"),
  /** FK → media_assets.id */
  media_asset_id: z.string().uuid(),
  /** Display caption shown below the image. */
  caption: z.string(),
  contributor_id: z.string().uuid().optional(),
  /**
   * Stable per-item identity key (mirrors TextItem.slot_key), e.g.
   * "galignani-scan-page-1". Lets re-running an ingest replace its own items
   * idempotently without clobbering hand-curated images in the same section.
   * Assigned by ingest scripts; absent on manually added images.
   */
  slot_key: z.string().min(1).optional(),
});

/** An audio asset — period music recordings. */
export const AudioItemSchema = z.object({
  kind: z.literal("audio"),
  /** FK → media_assets.id */
  media_asset_id: z.string().uuid(),
  work_title: z.string().min(1),
  composer: z.string().min(1),
  audio_license: z.string().min(1),
  contributor_id: z.string().uuid().optional(),
});

/** Discriminated union of all doc item variants. */
export const DocItemSchema = z.discriminatedUnion("kind", [
  TextItemSchema,
  ImageItemSchema,
  AudioItemSchema,
]);

export type TextItem = z.infer<typeof TextItemSchema>;
export type ImageItem = z.infer<typeof ImageItemSchema>;
export type AudioItem = z.infer<typeof AudioItemSchema>;
export type DocItem = z.infer<typeof DocItemSchema>;

// ---------------------------------------------------------------------------
// Débats sub-sections
// ---------------------------------------------------------------------------

export const DebatsDocSchema = z.object({
  music: z.array(DocItemSchema).default([]),
  theater: z.array(DocItemSchema).default([]),
  art: z.array(DocItemSchema).default([]),
  literature: z.array(DocItemSchema).default([]),
});

export type DebatsDoc = z.infer<typeof DebatsDocSchema>;

// ---------------------------------------------------------------------------
// Full day_content.doc shape
// ---------------------------------------------------------------------------

export const DayDocSchema = z.object({
  /**
   * Link to the original full issue on Gallica.
   * One per day — the canonical "view the original" URL.
   */
  gallica_issue_url: z.string().url().nullable(),

  /**
   * Total page images in the Gallica issue (typically 4 for Journal des Débats).
   * Set by resolve-issue; lets pull-scans skip the Pagination API when known.
   */
  gallica_page_count: z.number().int().positive().nullable().default(null),

  /**
   * Single image item for the page-1 feuilleton strip crop, or null if not
   * yet cropped. Shown in the left FeuilletonStrip panel.
   */
  feuilleton_strip: ImageItemSchema.nullable(),

  /**
   * Full 4-page scan images for the "Original paper" tab.
   * Empty array = scans not yet ingested.
   */
  original_pages: z.array(ImageItemSchema).default([]),

  /** Day overview — editorial summary / standfirst lead (written by summarize-day). */
  overview: z.array(DocItemSchema).default([]),

  /**
   * Front-page general news & politics, segmented from the translated pages.
   * Kept separate from `overview` so the editorial summary (summarize-day) no
   * longer overwrites the segmented news content.
   */
  news: z.array(DocItemSchema).default([]),

  /** Chapter text items for this installment. */
  chapter: z.array(DocItemSchema).default([]),

  /** Journal des Débats arts/letters sections (translated to English). */
  debats: DebatsDocSchema.default({
    music: [],
    theater: [],
    art: [],
    literature: [],
  }),

  /** Art & Exhibitions context — Salon, Cluny, Versailles, etc. */
  art_exhibitions: z.array(DocItemSchema).default([]),

  /** Science & Advancements — Foucault/Donné feuilletons, Académie reports. */
  science: z.array(DocItemSchema).default([]),

  /** Galignani's Messenger content for this date. */
  galignani: z.array(DocItemSchema).default([]),

  /**
   * Per-page full-paper translations. Each item corresponds to one ALTO page
   * (page 1, 2, …) translated verbatim, without section segmentation.
   * Populated by the pipeline's page-by-page translation pass.
   * Shown on the "Translated paper" tab for complete coverage.
   */
  translated_pages: z.array(TextItemSchema).default([]),
});

export type DayDoc = z.infer<typeof DayDocSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse and validate a raw day_content.doc JSON value.
 * Throws a ZodError with descriptive messages if validation fails.
 */
export function parseDayDoc(raw: unknown): DayDoc {
  return DayDocSchema.parse(raw);
}

/**
 * Safe parse — returns { success, data } or { success: false, error }.
 */
export function safeParseDayDoc(raw: unknown) {
  return DayDocSchema.safeParse(raw);
}

/** Empty doc template — useful as a starting point for new installment rows. */
export function emptyDayDoc(): DayDoc {
  return DayDocSchema.parse({
    gallica_issue_url: null,
    gallica_page_count: null,
    feuilleton_strip: null,
  });
}
