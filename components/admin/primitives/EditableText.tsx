"use client";

/**
 * components/admin/primitives/EditableText.tsx
 *
 * Wraps any content with an inline edit affordance in admin mode.
 * The pencil icon appears on hover; clicking opens an inline textarea/input.
 * Reader view is byte-for-byte unchanged when admin mode is off.
 */

import React, { useState, useRef, useCallback } from "react";
import styled from "styled-components";
import { useAdminMode } from "@/components/admin/AdminModeProvider";

interface EditableTextProps {
  value: string;
  onSave: (newValue: string) => Promise<void>;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Wrapper = styled.div`
  position: relative;

  &:hover .edit-btn {
    opacity: 1;
  }
`;

const EditBtn = styled.button`
  position: absolute;
  top: 0;
  right: 0;
  opacity: 0;
  transition: opacity 0.12s;
  padding: 2px 6px;
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: var(--gilt-warm);
  color: var(--ink-primary);
  border: none;
  cursor: pointer;
  z-index: 10;
  line-height: 1.8;

  &:hover {
    background: var(--gilt-deep);
    color: white;
  }
`;

const EditArea = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const StyledTextarea = styled.textarea`
  width: 100%;
  padding: 8px 10px;
  font-family: var(--font-body-stack);
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--ink-primary);
  background: var(--paper-base);
  border: 1.5px solid var(--gilt-warm);
  resize: vertical;
  min-height: 80px;
  outline: none;

  &:focus {
    border-color: var(--gilt-deep);
  }
`;

const StyledInput = styled.input`
  width: 100%;
  padding: 6px 10px;
  font-family: var(--font-body-stack);
  font-size: 0.95rem;
  color: var(--ink-primary);
  background: var(--paper-base);
  border: 1.5px solid var(--gilt-warm);
  outline: none;

  &:focus {
    border-color: var(--gilt-deep);
  }
`;

const BtnRow = styled.div`
  display: flex;
  gap: 6px;
`;

const SaveBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 3px 10px;
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
  padding: 3px 10px;
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
// Component
// ---------------------------------------------------------------------------

export default function EditableText({
  value,
  onSave,
  multiline = true,
  placeholder,
  className,
  children,
}: EditableTextProps) {
  const { adminMode } = useAdminMode();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setDraft(value);
    setStatus(null);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  }, [value]);

  const handleSave = useCallback(async () => {
    if (draft === value) { setEditing(false); return; }
    setSaving(true);
    setStatus(null);
    try {
      await onSave(draft);
      setStatus("Saved");
      setEditing(false);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [draft, value, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") { setEditing(false); setDraft(value); }
      if (!multiline && e.key === "Enter") { e.preventDefault(); handleSave(); }
      if (multiline && e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSave();
    },
    [multiline, handleSave, value],
  );

  if (!adminMode) return <>{children}</>;

  return (
    <Wrapper className={className}>
      {editing ? (
        <EditArea>
          {multiline ? (
            <StyledTextarea
              ref={inputRef as React.Ref<HTMLTextAreaElement>}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={6}
            />
          ) : (
            <StyledInput
              ref={inputRef as React.Ref<HTMLInputElement>}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
            />
          )}
          <BtnRow>
            <SaveBtn onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </SaveBtn>
            <CancelBtn onClick={() => { setEditing(false); setDraft(value); }}>
              Cancel
            </CancelBtn>
            {status && <StatusMsg>{status}</StatusMsg>}
          </BtnRow>
        </EditArea>
      ) : (
        <>
          {children}
          <EditBtn
            className="edit-btn"
            onClick={startEdit}
            title="Edit"
            aria-label="Edit this text"
          >
            ✎ Edit
          </EditBtn>
          {status && <StatusMsg style={{ marginLeft: 8 }}>{status}</StatusMsg>}
        </>
      )}
    </Wrapper>
  );
}
