"use client";

/**
 * components/admin/primitives/MediaPicker.tsx
 *
 * Modal for selecting an existing media asset or uploading a new one.
 * Calls searchMediaAssets server action; shows thumbnails with kind chips.
 */

import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { searchMediaAssets } from "@/app/actions/admin";
import MediaUploadField from "./MediaUploadField";
import type { MediaAssetSearchResult, MediaKind } from "@/lib/types/media";

interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAssetSearchResult) => void;
  filterKind?: "image" | "audio";
}

// Map filterKind to the actual media_assets.kind values
const IMAGE_KINDS = ["illustration", "portrait", "caricature", "playbill", "architecture", "novel_plate", "scan", "other"];
const AUDIO_KINDS = ["audio"];

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(20, 15, 8, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const Dialog = styled.div`
  background: var(--paper-card);
  border: 1px solid var(--rule-mid);
  width: 100%;
  max-width: 780px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 40px rgba(0,0,0,0.35);
`;

const DialogHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--rule-light);
`;

const DialogTitle = styled.h3`
  font-family: var(--font-labels-stack);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-primary);
  margin: 0;
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  font-size: 14px;
  color: var(--ink-muted);
  cursor: pointer;
  padding: 2px 6px;
  &:hover { color: var(--ink-primary); }
`;

const SearchRow = styled.div`
  display: flex;
  gap: 8px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--rule-light);
  align-items: center;
`;

const SearchInput = styled.input`
  flex: 1;
  padding: 6px 10px;
  font-family: var(--font-body-stack);
  font-size: 0.88rem;
  color: var(--ink-primary);
  background: var(--paper-base);
  border: 1px solid var(--rule-light);
  outline: none;
  &:focus { border-color: var(--gilt-warm); }
`;

const KindFilter = styled.select`
  padding: 6px 8px;
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  background: var(--paper-base);
  border: 1px solid var(--rule-light);
  outline: none;
  &:focus { border-color: var(--gilt-warm); }
`;

const Grid = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px 18px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
`;

const AssetCard = styled.button`
  display: flex;
  flex-direction: column;
  background: var(--paper-base);
  border: 1px solid var(--rule-light);
  padding: 0;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.12s;

  &:hover { border-color: var(--gilt-warm); }
`;

const AssetThumb = styled.div<{ $url?: string | null }>`
  width: 100%;
  height: 88px;
  background: var(--paper-deep)
    ${({ $url }) => ($url ? `url("${$url}") center / cover no-repeat` : "")};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  color: var(--rule-mid);
`;

const AssetInfo = styled.div`
  padding: 6px 8px;
  border-top: 1px solid var(--rule-light);
`;

const AssetTitle = styled.p`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-secondary);
  margin: 0 0 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const KindChip = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-muted);
  border: 1px solid var(--rule-light);
  padding: 1px 4px;
`;

const DialogFooter = styled.div`
  padding: 10px 18px;
  border-top: 1px solid var(--rule-light);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

const EmptyMsg = styled.p`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-muted);
  padding: 24px;
  text-align: center;
  grid-column: 1 / -1;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MediaPicker({
  open,
  onClose,
  onSelect,
  filterKind,
}: MediaPickerProps) {
  const [query, setQuery] = useState("");
  // Empty = no explicit per-kind selection; the effective kind set is derived
  // from filterKind (image/audio group) below.
  const [kind, setKind] = useState<string>("");
  const [results, setResults] = useState<MediaAssetSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (): Promise<MediaAssetSearchResult[]> => {
    setLoading(true);
    try {
      // An explicit dropdown selection wins; otherwise constrain to the
      // image/audio kind group implied by filterKind.
      const effectiveKinds = kind
        ? [kind]
        : filterKind === "audio"
          ? AUDIO_KINDS
          : filterKind === "image"
            ? IMAGE_KINDS
            : undefined;
      const data = await searchMediaAssets(query, effectiveKinds);
      setResults(data);
      return data;
    } catch {
      setResults([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [query, kind, filterKind]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void search();
    }
  }, [open, search]);

  const handleUploadComplete = useCallback(
    async (result: { id: string; r2_key: string }) => {
      const data = await search();
      const uploaded = data.find((r) => r.id === result.id);
      if (uploaded) onSelect(uploaded);
    },
    [onSelect, search],
  );

  if (!open) return null;

  const uploadKind: MediaKind = filterKind === "audio" ? "audio" : "illustration";

  return (
    <Overlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <Dialog role="dialog" aria-modal="true" aria-label="Pick a media asset">
        <DialogHeader>
          <DialogTitle>Media Library</DialogTitle>
          <CloseBtn onClick={onClose} aria-label="Close">✕</CloseBtn>
        </DialogHeader>

        <SearchRow>
          <SearchInput
            type="search"
            placeholder="Search by title, caption, attribution…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          {!filterKind && (
            <KindFilter value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All kinds</option>
              {IMAGE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              {AUDIO_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </KindFilter>
          )}
        </SearchRow>

        <Grid>
          {loading && <EmptyMsg>Loading…</EmptyMsg>}
          {!loading && results.length === 0 && (
            <EmptyMsg>No assets found. Upload one below.</EmptyMsg>
          )}
          {!loading && results.map((asset) => (
            <AssetCard key={asset.id} onClick={() => onSelect(asset)} title={asset.title ?? asset.id}>
              <AssetThumb $url={filterKind !== "audio" ? asset.thumbnail_url : null}>
                {filterKind === "audio" ? "♪" : (!asset.thumbnail_url ? "🖼" : null)}
              </AssetThumb>
              <AssetInfo>
                <AssetTitle>{asset.title ?? "Untitled"}</AssetTitle>
                <KindChip>{asset.kind}</KindChip>
              </AssetInfo>
            </AssetCard>
          ))}
        </Grid>

        <DialogFooter>
          <MediaUploadField kind={uploadKind} onUploaded={handleUploadComplete} />
          <KindChip style={{ color: "var(--ink-muted)" }}>
            {loading ? "Searching…" : `${results.length} asset${results.length !== 1 ? "s" : ""}`}
          </KindChip>
        </DialogFooter>
      </Dialog>
    </Overlay>
  );
}
