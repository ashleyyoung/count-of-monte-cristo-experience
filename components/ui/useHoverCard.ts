"use client";

/**
 * components/ui/useHoverCard.ts
 *
 * Shared open/close behavior for the hover-citation primitives (<Cite>, <AdminNote>).
 *
 * Solves the classic "hover gap" problem: the floating card is absolutely
 * positioned a few px away from its trigger, so leaving the trigger must not
 * immediately close the card or the user can never move the pointer onto it to
 * click a link. We close on a short grace timer that any re-entry (trigger or
 * card) cancels.
 *
 * Interaction model:
 * - Pointer: enter trigger/card -> open; leave -> close after a grace delay.
 * - Keyboard: focus -> open; blur outside the wrapper -> close.
 * - Click/tap: open (never toggles, so a hovering mouse click can't close it,
 *   and touch devices with no hover still open it).
 * - Escape or an outside click/tap closes immediately.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const CLOSE_GRACE_MS = 120;

export function useHoverCard() {
  const [open, setOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openNow = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const closeSoon = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  }, [cancelClose]);

  const closeNow = useCallback(() => {
    cancelClose();
    setOpen(false);
  }, [cancelClose]);

  // Resolve prefers-reduced-motion (starts false so SSR + first client render match).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Escape + outside click close immediately while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNow();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        closeNow();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, closeNow]);

  // Clear any pending timer on unmount.
  useEffect(() => () => cancelClose(), [cancelClose]);

  /** Blur handler that keeps the card open while focus stays inside the wrapper. */
  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      if (!wrapRef.current?.contains(e.relatedTarget as Node)) {
        closeNow();
      }
    },
    [closeNow],
  );

  return {
    open,
    reducedMotion,
    wrapRef,
    openNow,
    closeSoon,
    closeNow,
    handleBlur,
  };
}
