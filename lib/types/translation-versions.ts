/** Metadata for a row in translation_versions (prose body lives on R2). */
export interface TranslationVersionMeta {
  id: string;
  slot_key: string;
  section: string;
  translation_origin: string;
  model_used: string | null;
  translator: string | null;
  translation_source_url: string | null;
  source_text_url: string | null;
  fr_intermediate_r2_key: string | null;
  text_r2_key: string;
  cost_usd: number | null;
  low_confidence: boolean;
  admin_notes: string | null;
  translated_at: string;
  attribution: string;
  license: string;
}
