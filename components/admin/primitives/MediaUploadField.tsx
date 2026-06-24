"use client";

/**
 * components/admin/primitives/MediaUploadField.tsx
 *
 * File input that converts a selected file to base64 and calls uploadMediaToR2.
 * Returns the new asset id + r2_key to the parent via onUploaded.
 */

import React, { useRef, useState } from "react";
import styled from "styled-components";
import { uploadMediaToR2, type MediaKind } from "@/app/actions/admin";

interface MediaUploadFieldProps {
  kind: MediaKind;
  accept?: string;
  onUploaded: (result: { id: string; r2_key: string }) => void;
}

const UploadLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border: 1px dashed var(--rule-mid);
  color: var(--ink-muted);
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
  background: var(--paper-feature);

  &:hover { border-color: var(--gilt-warm); color: var(--gilt-deep); }
`;

const HiddenInput = styled.input`
  display: none;
`;

const StatusLine = styled.p`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  margin: 4px 0 0;
`;

/**
 * Reads a File to a base64 string using browser-native FileReader.
 * Avoids depending on the Node `Buffer` global in the client bundle.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export default function MediaUploadField({
  kind,
  accept,
  onUploaded,
}: MediaUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const defaultAccept = kind === "audio" ? "audio/*" : "image/*";

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatus(`Uploading ${file.name}…`);
    try {
      const base64 = await fileToBase64(file);
      const result = await uploadMediaToR2(file.name, base64, file.type, kind);
      setStatus(`Uploaded — ${file.name}`);
      onUploaded(result);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <UploadLabel>
        {uploading ? "Uploading…" : "⬆ Upload file"}
        <HiddenInput
          ref={inputRef}
          type="file"
          accept={accept ?? defaultAccept}
          onChange={handleChange}
          disabled={uploading}
        />
      </UploadLabel>
      {status && <StatusLine>{status}</StatusLine>}
    </div>
  );
}
