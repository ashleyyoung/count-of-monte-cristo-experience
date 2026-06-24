"use client";

/**
 * components/ui/AdminNote.tsx
 *
 * Admin-mode-only annotation marker (⚑).
 * Invisible to public readers — only renders when adminMode === true.
 *
 * Clicking the marker opens the same torn-margin Pinyon-Script card used by
 * <Cite>, showing admin_notes text and a low_confidence badge.
 *
 * The "Mark resolved" button fires an onResolve callback. The actual server
 * action that clears admin_notes is wired in Sprint 7; this component accepts
 * a typed callback prop and provides a no-op default so it is self-contained.
 */

import React, { useId } from "react";
import styled, { keyframes, css } from "styled-components";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import { useHoverCard } from "./useHoverCard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AdminNoteProps {
  /** The note text stored in admin_notes */
  note: string;
  /** Whether the model self-flagged this item as low-confidence */
  lowConfidence?: boolean;
  /** Called when the admin clicks "Mark resolved". Wired to a server action in Sprint 7. */
  onResolve?: () => void;
}

// ---------------------------------------------------------------------------
// Animations
// ---------------------------------------------------------------------------

const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
`;

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Marker = styled.button`
  display: inline;
  vertical-align: super;
  font-size: 0.65em;
  line-height: 1;
  color: var(--oxblood);
  background: none;
  border: none;
  padding: 0 1px;
  cursor: pointer;
  transition: color 0.1s, opacity 0.1s;
  position: relative;
  top: -0.05em;
  opacity: 0.7;

  &:hover,
  &:focus-visible {
    opacity: 1;
    outline: none;
  }
`;

const CardWrap = styled.span`
  position: relative;
  display: inline;
`;

const Card = styled.div<{ $reducedMotion: boolean }>`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 201;

  background: var(--paper-card);
  border: 1px solid var(--oxblood);
  border-radius: 1px 3px 2px 1px / 2px 1px 3px 1px;
  box-shadow:
    0 2px 12px rgba(29, 20, 10, 0.14),
    inset 0 0 0 1px rgba(124, 45, 42, 0.12);

  padding: 0.65rem 0.85rem 0.6rem;
  min-width: 200px;
  max-width: 300px;
  width: max-content;

  ${({ $reducedMotion }) =>
    !$reducedMotion &&
    css`
      animation: ${fadeIn} 0.14s ease-out both;
    `}
`;

const CardHeader = styled.div`
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.3rem;
`;

const CardLabel = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--oxblood);
`;

const ConfidenceBadge = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--paper-base);
  background: var(--oxblood);
  padding: 0.1rem 0.35rem;
  border-radius: 1px;
`;

const NoteText = styled.p`
  margin: 0 0 0.5rem;
  font-family: var(--font-script-stack);
  font-size: 0.95rem;
  line-height: 1.4;
  color: var(--ink-secondary);
`;

const ResolveBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  background: none;
  border: 1px solid var(--rule-light);
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  transition: color 0.1s, border-color 0.1s;

  &:hover {
    color: var(--ink-primary);
    border-color: var(--rule-mid);
  }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminNote({
  note,
  lowConfidence = false,
  onResolve,
}: AdminNoteProps) {
  const { adminMode } = useAdminMode();
  const { open, reducedMotion, wrapRef, openNow, closeSoon, closeNow, handleBlur } =
    useHoverCard();
  const id = useId();
  const cardId = `admin-note-card-${id}`;

  // Admin-only — render nothing for public readers
  if (!adminMode) return null;

  return (
    <CardWrap ref={wrapRef} onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <Marker
        type="button"
        aria-label={`Admin note${lowConfidence ? " (low confidence)" : ""}`}
        aria-expanded={open}
        aria-controls={open ? cardId : undefined}
        onFocus={openNow}
        onBlur={handleBlur}
        onClick={openNow}
      >
        ⚑
      </Marker>

      {open && (
        <Card $reducedMotion={reducedMotion} id={cardId} role="group" aria-label="Admin note">
          <CardHeader>
            <CardLabel>Admin note</CardLabel>
            {lowConfidence && <ConfidenceBadge>Low confidence</ConfidenceBadge>}
          </CardHeader>
          <NoteText>{note}</NoteText>
          {onResolve && (
            <ResolveBtn
              type="button"
              onClick={() => {
                onResolve();
                closeNow();
              }}
            >
              Mark resolved
            </ResolveBtn>
          )}
        </Card>
      )}
    </CardWrap>
  );
}
