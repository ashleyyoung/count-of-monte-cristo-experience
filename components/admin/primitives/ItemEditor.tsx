"use client";

/**
 * components/admin/primitives/ItemEditor.tsx
 *
 * Modal form for creating or editing a DocItem (text / image / audio).
 * Form fields are derived from the shared Zod schema variants.
 * For text items the prose body is edited in a textarea and uploaded to R2
 * server-side via upsertDayContentItem.
 */

import React, { useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/navigation";
import { upsertDayContentItem, type DayContentSection } from "@/app/actions/admin";
import type { DocItem } from "@/lib/types/content";
import MediaPicker from "./MediaPicker";
import type { MediaAssetSearchResult } from "@/app/actions/admin";

interface ItemEditorProps {
  open: boolean;
  onClose: () => void;
  date: string;
  section: DayContentSection;
  /** Existing item to edit; undefined = new item. */
  existingItem?: DocItem;
  existingTextBody?: string;
  existingItemIndex?: number;
}

type KindTab = "text" | "image" | "audio";

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(20, 15, 8, 0.65);
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const Dialog = styled.div`
  background: var(--paper-card);
  border: 1px solid var(--rule-mid);
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 40px rgba(0,0,0,0.4);
  overflow: hidden;
`;

const DialogHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--rule-light);
  flex-shrink: 0;
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

const KindTabs = styled.div`
  display: flex;
  border-bottom: 1px solid var(--rule-light);
  flex-shrink: 0;
`;

const KindTab = styled.button<{ $active: boolean }>`
  flex: 1;
  padding: 8px;
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: none;
  border: none;
  border-bottom: 2px solid ${({ $active }) => ($active ? "var(--gilt-warm)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--ink-primary)" : "var(--ink-muted)")};
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.1s, border-color 0.1s;
  &:hover { color: var(--ink-secondary); }
`;

const FormBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const FieldLabel = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-muted);
`;

const FieldInput = styled.input`
  padding: 6px 10px;
  font-family: var(--font-body-stack);
  font-size: 0.88rem;
  color: var(--ink-primary);
  background: var(--paper-base);
  border: 1px solid var(--rule-light);
  outline: none;
  &:focus { border-color: var(--gilt-warm); }
`;

const FieldTextarea = styled.textarea`
  padding: 8px 10px;
  font-family: var(--font-body-stack);
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--ink-primary);
  background: var(--paper-base);
  border: 1px solid var(--rule-light);
  resize: vertical;
  min-height: 140px;
  outline: none;
  &:focus { border-color: var(--gilt-warm); }
`;

const FieldSelect = styled.select`
  padding: 6px 10px;
  font-family: var(--font-body-stack);
  font-size: 0.88rem;
  color: var(--ink-primary);
  background: var(--paper-base);
  border: 1px solid var(--rule-light);
  outline: none;
  &:focus { border-color: var(--gilt-warm); }
`;

const MediaPreview = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: var(--paper-feature);
  border: 1px solid var(--rule-light);
`;

const MediaThumb = styled.div<{ $url?: string | null }>`
  width: 56px;
  height: 44px;
  background: var(--paper-deep)
    ${({ $url }) => ($url ? `url("${$url}") center / cover no-repeat` : "")};
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--rule-mid);
`;

const MediaInfo = styled.div`
  flex: 1;
`;

const MediaTitle = styled.p`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-secondary);
  margin: 0 0 2px;
`;

const PickBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  background: transparent;
  color: var(--gilt-deep);
  border: 1px solid var(--gilt-warm);
  cursor: pointer;
  &:hover { background: rgba(201,162,75,0.1); }
`;

const DialogFooter = styled.div`
  padding: 12px 18px;
  border-top: 1px solid var(--rule-light);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const SaveBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 5px 16px;
  background: var(--gilt-warm);
  color: var(--ink-primary);
  border: none;
  cursor: pointer;
  line-height: 1.8;
  &:hover { background: var(--gilt-deep); color: white; }
  &:disabled { opacity: 0.4; cursor: default; }
`;

const CancelBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 5px 14px;
  background: transparent;
  color: var(--ink-muted);
  border: 1px solid var(--rule-mid);
  cursor: pointer;
  line-height: 1.8;
  &:hover { border-color: var(--ink-muted); color: var(--ink-secondary); }
`;

const StatusMsg = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal asset stub seeded when editing an existing image/audio item.
 * We only know the linked media_asset_id from the DocItem; the full record
 * (title/thumbnail) is not threaded yet. This keeps the existing binding so a
 * caption/metadata edit doesn't force the admin to re-pick the asset.
 */
function placeholderAsset(id: string, kind: string): MediaAssetSearchResult {
  return {
    id,
    kind,
    r2_key: null,
    source_url: null,
    title: null,
    caption: null,
    attribution: null,
    thumbnail_url: null,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ItemEditor({
  open,
  onClose,
  date,
  section,
  existingItem,
  existingTextBody = "",
  existingItemIndex,
}: ItemEditorProps) {
  const router = useRouter();

  // State is initialized from existingItem via lazy initializers.
  // The parent passes key={editingIndex ?? "new"} so React remounts this
  // component whenever the target item changes, keeping initializers correct.
  const [activeKind, setActiveKind] = useState<KindTab>(() => existingItem?.kind ?? "text");

  // Text form state
  const [textFields, setTextFields] = useState(() =>
    existingItem?.kind === "text"
      ? { source: existingItem.source, original_date: existingItem.original_date, gallica_url: existingItem.gallica_url, license: existingItem.license, attribution: existingItem.attribution }
      : { source: "", original_date: "", gallica_url: "https://gallica.bnf.fr", license: "Public Domain", attribution: "" },
  );
  const [textBody, setTextBody] = useState(() => (existingItem?.kind === "text" ? existingTextBody : ""));
  // Tracks whether the admin actually edited the prose body. The body is not
  // preloaded from R2 yet (deferred to Sprint 9), so on an edit we must leave
  // the existing R2 object untouched unless the admin typed a new body.
  const [bodyDirty, setBodyDirty] = useState(false);

  // Image form state
  const [imageCaption, setImageCaption] = useState(() => (existingItem?.kind === "image" ? existingItem.caption : ""));
  const [imageAsset, setImageAsset] = useState<MediaAssetSearchResult | null>(() =>
    existingItem?.kind === "image" ? placeholderAsset(existingItem.media_asset_id, "image") : null,
  );

  // Audio form state
  const [audioFields, setAudioFields] = useState(() =>
    existingItem?.kind === "audio"
      ? { work_title: existingItem.work_title, composer: existingItem.composer, audio_license: existingItem.audio_license }
      : { work_title: "", composer: "", audio_license: "" },
  );
  const [audioAsset, setAudioAsset] = useState<MediaAssetSearchResult | null>(() =>
    existingItem?.kind === "audio" ? placeholderAsset(existingItem.media_asset_id, "audio") : null,
  );

  // Media picker visibility
  const [pickerOpen, setPickerOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    const isEditingNow = existingItemIndex !== undefined;
    try {
      let item: DocItem;
      let body: string | null = null;

      if (activeKind === "text") {
        if (!textFields.source || !textFields.original_date || !textFields.gallica_url) {
          setStatus("Source, date, and Gallica URL are required.");
          setSaving(false);
          return;
        }
        // New text items require a body; edits keep the existing R2 prose
        // unless the admin typed a replacement.
        if (!isEditingNow && !textBody.trim()) {
          setStatus("Text body is required for a new item.");
          setSaving(false);
          return;
        }
        const existingKey =
          existingItem?.kind === "text" ? existingItem.text_r2_key : null;
        item = { kind: "text", text_r2_key: existingKey ?? "__pending__", ...textFields };
        // Send a body (overwriting R2) only for new items or when the admin
        // actually edited the prose; null leaves the existing object intact.
        body = isEditingNow ? (bodyDirty ? textBody : null) : textBody;
      } else if (activeKind === "image") {
        if (!imageAsset) { setStatus("Pick a media asset first."); setSaving(false); return; }
        item = { kind: "image", media_asset_id: imageAsset.id, caption: imageCaption };
      } else {
        if (!audioAsset) { setStatus("Pick a media asset first."); setSaving(false); return; }
        if (!audioFields.work_title || !audioFields.composer) {
          setStatus("Work title and composer are required.");
          setSaving(false);
          return;
        }
        item = { kind: "audio", media_asset_id: audioAsset.id, ...audioFields };
      }

      await upsertDayContentItem(
        date,
        section,
        item,
        body,
        existingItemIndex ?? null,
      );
      router.refresh();
      onClose();
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const isEditing = existingItemIndex !== undefined;
  const pickerFilterKind: "image" | "audio" = activeKind === "audio" ? "audio" : "image";

  return (
    <>
      <Overlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <Dialog role="dialog" aria-modal="true" aria-label={isEditing ? "Edit item" : "Add item"}>
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit item" : "Add item"} — {section}</DialogTitle>
            <CloseBtn onClick={onClose} aria-label="Close">✕</CloseBtn>
          </DialogHeader>

          {!isEditing && (
            <KindTabs>
              {(["text", "image", "audio"] as KindTab[]).map((k) => (
                <KindTab key={k} $active={activeKind === k} onClick={() => setActiveKind(k)}>
                  {k}
                </KindTab>
              ))}
            </KindTabs>
          )}

          <FormBody>
            {activeKind === "text" && (
              <>
                <Field>
                  <FieldLabel>Text body (prose)</FieldLabel>
                  <FieldTextarea
                    value={textBody}
                    onChange={(e) => { setTextBody(e.target.value); setBodyDirty(true); }}
                    placeholder={isEditing ? "Leave blank to keep the current prose…" : "Enter English prose…"}
                    rows={8}
                  />
                  {isEditing && (
                    <FieldLabel style={{ textTransform: "none", letterSpacing: 0, color: "var(--ink-muted)" }}>
                      The current prose isn’t loaded here. Leave this blank to keep it; type to replace it.
                    </FieldLabel>
                  )}
                </Field>
                <Field>
                  <FieldLabel>Source publication</FieldLabel>
                  <FieldInput
                    value={textFields.source}
                    onChange={(e) => setTextFields((f) => ({ ...f, source: e.target.value }))}
                    placeholder="e.g. Journal des Débats"
                  />
                </Field>
                <Field>
                  <FieldLabel>Original publication date (YYYY-MM-DD)</FieldLabel>
                  <FieldInput
                    value={textFields.original_date}
                    onChange={(e) => setTextFields((f) => ({ ...f, original_date: e.target.value }))}
                    placeholder="1844-08-28"
                  />
                </Field>
                <Field>
                  <FieldLabel>Gallica URL</FieldLabel>
                  <FieldInput
                    type="url"
                    value={textFields.gallica_url}
                    onChange={(e) => setTextFields((f) => ({ ...f, gallica_url: e.target.value }))}
                    placeholder="https://gallica.bnf.fr/…"
                  />
                </Field>
                <Field>
                  <FieldLabel>License</FieldLabel>
                  <FieldSelect
                    value={textFields.license}
                    onChange={(e) => setTextFields((f) => ({ ...f, license: e.target.value }))}
                  >
                    <option>Public Domain</option>
                    <option>CC BY-SA 4.0</option>
                    <option>CC BY 4.0</option>
                    <option>All rights reserved</option>
                    <option>Unknown</option>
                  </FieldSelect>
                </Field>
                <Field>
                  <FieldLabel>Attribution</FieldLabel>
                  <FieldInput
                    value={textFields.attribution}
                    onChange={(e) => setTextFields((f) => ({ ...f, attribution: e.target.value }))}
                    placeholder="e.g. Hector Berlioz, 1844"
                  />
                </Field>
              </>
            )}

            {activeKind === "image" && (
              <>
                {imageAsset ? (
                  <MediaPreview>
                    <MediaThumb $url={imageAsset.thumbnail_url}>
                      {!imageAsset.thumbnail_url && "🖼"}
                    </MediaThumb>
                    <MediaInfo>
                      <MediaTitle>{imageAsset.title ?? "Untitled"}</MediaTitle>
                      <span style={{ fontFamily: "var(--font-labels-stack)", fontSize: 8, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{imageAsset.kind}</span>
                    </MediaInfo>
                    <PickBtn onClick={() => setPickerOpen(true)}>Change</PickBtn>
                  </MediaPreview>
                ) : (
                  <PickBtn onClick={() => setPickerOpen(true)} style={{ alignSelf: "flex-start" }}>
                    ⊕ Pick image asset
                  </PickBtn>
                )}
                <Field>
                  <FieldLabel>Caption</FieldLabel>
                  <FieldInput
                    value={imageCaption}
                    onChange={(e) => setImageCaption(e.target.value)}
                    placeholder="Visible caption below the image"
                  />
                </Field>
              </>
            )}

            {activeKind === "audio" && (
              <>
                {audioAsset ? (
                  <MediaPreview>
                    <MediaThumb>♪</MediaThumb>
                    <MediaInfo>
                      <MediaTitle>{audioAsset.title ?? "Untitled"}</MediaTitle>
                    </MediaInfo>
                    <PickBtn onClick={() => setPickerOpen(true)}>Change</PickBtn>
                  </MediaPreview>
                ) : (
                  <PickBtn onClick={() => setPickerOpen(true)} style={{ alignSelf: "flex-start" }}>
                    ⊕ Pick audio asset
                  </PickBtn>
                )}
                <Field>
                  <FieldLabel>Work title</FieldLabel>
                  <FieldInput
                    value={audioFields.work_title}
                    onChange={(e) => setAudioFields((f) => ({ ...f, work_title: e.target.value }))}
                    placeholder="e.g. Symphonie Fantastique"
                  />
                </Field>
                <Field>
                  <FieldLabel>Composer</FieldLabel>
                  <FieldInput
                    value={audioFields.composer}
                    onChange={(e) => setAudioFields((f) => ({ ...f, composer: e.target.value }))}
                    placeholder="e.g. Hector Berlioz"
                  />
                </Field>
                <Field>
                  <FieldLabel>Audio license</FieldLabel>
                  <FieldInput
                    value={audioFields.audio_license}
                    onChange={(e) => setAudioFields((f) => ({ ...f, audio_license: e.target.value }))}
                    placeholder="e.g. CC0 1.0"
                  />
                </Field>
              </>
            )}
          </FormBody>

          <DialogFooter>
            <SaveBtn onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </SaveBtn>
            <CancelBtn onClick={onClose}>Cancel</CancelBtn>
            {status && <StatusMsg>{status}</StatusMsg>}
          </DialogFooter>
        </Dialog>
      </Overlay>

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        filterKind={pickerFilterKind}
        onSelect={(asset) => {
          if (activeKind === "image") setImageAsset(asset);
          else setAudioAsset(asset);
          setPickerOpen(false);
        }}
      />
    </>
  );
}
