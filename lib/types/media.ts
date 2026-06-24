export const MEDIA_KINDS = [
  "illustration",
  "portrait",
  "caricature",
  "playbill",
  "architecture",
  "novel_plate",
  "scan",
  "audio",
  "other",
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

export interface MediaAssetSearchResult {
  id: string;
  kind: string;
  r2_key: string | null;
  source_url: string | null;
  title: string | null;
  caption: string | null;
  attribution: string | null;
  thumbnail_url: string | null;
}

export interface MediaAssetUpsert {
  id?: string;
  kind: MediaKind;
  title: string | null;
  caption: string | null;
  r2_key: string | null;
  source_url: string | null;
  download_blocked: boolean;
  download_blocked_reason: string | null;
  license: string | null;
  attribution: string | null;
  source: string | null;
  tags: string[];
}
