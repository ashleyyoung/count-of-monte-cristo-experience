"use client";

import { useEffect, useCallback } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import type { ResolvedImageItem } from "@/lib/content";

interface Props {
  pages: ResolvedImageItem[];
  gallicaUrl: string | null;
  currentPage: number;
  onClose: () => void;
  onPageChange: (page: number) => void;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Overlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(15, 10, 5, 0.88);
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

const Modal = styled(motion.div)`
  background: var(--paper-deep);
  border: 1px solid var(--rule-mid);
  max-width: 880px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--rule-mid);
  background: var(--paper-feature);
  flex-shrink: 0;
`;

const ModalTitle = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-secondary);
  letter-spacing: 0.08em;
`;

const CloseBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-muted);
  background: none;
  border: 1px solid var(--rule-light);
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 2px;
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: var(--ink-primary);
    border-color: var(--rule-mid);
  }
`;

const ScanArea = styled.div`
  flex: 1;
  overflow: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 16px;
  background: var(--paper-deep);
`;

const ScanImage = styled.img`
  max-width: 100%;
  height: auto;
  border: 1px solid var(--rule-mid);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
`;

const ModalFooter = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 18px;
  border-top: 1px solid var(--rule-mid);
  background: var(--paper-feature);
  flex-shrink: 0;
  gap: 12px;
`;

const PageControls = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const PageBtn = styled.button<{ $disabled?: boolean }>`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  padding: 4px 12px;
  border: 1px solid var(--rule-mid);
  background: transparent;
  color: ${({ $disabled }) => ($disabled ? "var(--rule-mid)" : "var(--ink-tertiary)")};
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  pointer-events: ${({ $disabled }) => ($disabled ? "none" : "auto")};
  border-radius: 2px;
  transition: color 0.15s;

  &:hover {
    color: var(--ink-primary);
  }
`;

const PageCounter = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-muted);
`;

const GallicaLink = styled.a`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-tertiary);
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover { color: var(--oxblood); }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScanViewer({
  pages,
  gallicaUrl,
  currentPage,
  onClose,
  onPageChange,
}: Props) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && currentPage > 0) onPageChange(currentPage - 1);
      if (e.key === "ArrowRight" && currentPage < pages.length - 1) onPageChange(currentPage + 1);
    },
    [onClose, currentPage, pages.length, onPageChange],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const page = pages[currentPage];

  return (
    <AnimatePresence>
      <Overlay
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <Modal
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.2 }}
        >
          <ModalHeader>
            <ModalTitle>
              Original Paper · Page {currentPage + 1} of {pages.length || "—"}
            </ModalTitle>
            <CloseBtn onClick={onClose} aria-label="Close scan viewer">
              Close ✕
            </CloseBtn>
          </ModalHeader>

          <ScanArea>
            {page ? (
              <ScanImage
                src={page.url}
                alt={page.caption || `Page ${currentPage + 1} scan`}
              />
            ) : (
              <PageCounter>No scan available for this page.</PageCounter>
            )}
          </ScanArea>

          <ModalFooter>
            <PageControls>
              <PageBtn
                $disabled={currentPage === 0}
                onClick={() => onPageChange(currentPage - 1)}
              >
                ← Prev
              </PageBtn>
              <PageCounter>
                {currentPage + 1} / {pages.length}
              </PageCounter>
              <PageBtn
                $disabled={currentPage >= pages.length - 1}
                onClick={() => onPageChange(currentPage + 1)}
              >
                Next →
              </PageBtn>
            </PageControls>

            {gallicaUrl && (
              <GallicaLink
                href={gallicaUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View on Gallica / BnF ↗
              </GallicaLink>
            )}
          </ModalFooter>
        </Modal>
      </Overlay>
    </AnimatePresence>
  );
}
