/**
 * Resolve a media asset to a display URL.
 *
 * Policy: all media is downloaded and hosted on R2 (Cloudflare CDN).
 * `source_url` is provenance metadata — only used for display when the asset
 * genuinely could not be downloaded (download_blocked = true).
 */

import { r2PublicUrl } from "@/lib/r2-server";

export interface MediaAsset {
  id: string;
  r2_key: string | null;
  source_url: string | null;
  download_blocked: boolean;
  download_blocked_reason: string | null;
}

/**
 * Returns the best display URL for an asset:
 * - If r2_key is set, returns the Cloudflare CDN URL.
 * - If r2_key is null and download_blocked is true, returns source_url (with warning).
 * - Otherwise throws — a missing r2_key without download_blocked is a data error.
 */
export function resolveMediaUrl(asset: MediaAsset): string {
  if (asset.r2_key) {
    return r2PublicUrl(asset.r2_key);
  }

  if (asset.download_blocked && asset.source_url) {
    console.warn(
      `[media] Asset ${asset.id} (${asset.download_blocked_reason ?? "no reason given"}) — serving via source_url instead of R2.`,
    );
    return asset.source_url;
  }

  throw new Error(
    `[media] Asset ${asset.id} has no r2_key and is not flagged download_blocked — this is a data error. source_url: ${asset.source_url ?? "null"}`,
  );
}

/**
 * Batch-resolve a list of assets to a map of id → display URL.
 * Skips assets where resolveMediaUrl would throw (logs error, omits from map).
 */
export function resolveMediaUrls(assets: MediaAsset[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const asset of assets) {
    try {
      map.set(asset.id, resolveMediaUrl(asset));
    } catch (err) {
      console.error(err);
    }
  }
  return map;
}
