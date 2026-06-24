"use client";

import { useState, useTransition } from "react";
import styled from "styled-components";
import type { ResolvedImageItem } from "@/lib/content";
import ScanViewer from "./ScanViewer";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import { visionTranscribe } from "@/app/actions/admin";

interface Props {
  stripImage: ResolvedImageItem | null;
  originalPages: ResolvedImageItem[];
  gallicaUrl: string | null;
  dateLabel: string;
  installmentDate: string;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Panel = styled.aside`
  background: var(--paper-feature);
  border-right: 3px double var(--rule-mid);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px 18px;
  overflow: hidden;
`;

const StripLabel = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const ScanFrame = styled.div`
  border: 1px solid var(--rule-mid);
  background: var(--paper-card);
  box-shadow: inset 0 0 30px rgba(120, 84, 40, 0.18);
  padding: 6px;
  flex: 1;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 200px;
  overflow: hidden;
`;

const ScanImg = styled.img`
  width: 100%;
  height: auto;
  display: block;
`;

const Placeholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 180px;
  gap: 10px;
  text-align: center;
`;

const PlaceholderText = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--rule-mid);
  letter-spacing: 0.08em;
  margin: 0;
`;

const GallicaPlaceholderLink = styled.a`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover { color: var(--oxblood); }
`;

const Attribution = styled.p`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 10px;
  color: var(--ink-muted);
  text-align: center;
  margin: 0;
`;

const ViewScanBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  padding: 10px 14px;
  width: 100%;
  background: var(--ink-primary);
  color: var(--paper-card);
  border: none;
  cursor: pointer;
  letter-spacing: 0.06em;
  transition: background 0.15s;
  text-align: center;

  &:hover {
    background: var(--oxblood);
  }

  &:disabled {
    background: var(--rule-mid);
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }
`;

const VisionBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  padding: 7px 14px;
  width: 100%;
  background: var(--oxblood);
  color: var(--paper-base);
  border: none;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: background 0.15s;
  text-align: center;

  &:hover:not(:disabled) {
    background: var(--ink-primary);
  }

  &:disabled {
    background: var(--rule-mid);
    cursor: wait;
  }
`;

const VisionFeedback = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  color: var(--oxblood);
  text-align: center;
  margin: 4px 0 0;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function FeuilletonStrip({
  stripImage,
  originalPages,
  gallicaUrl,
  dateLabel,
  installmentDate,
}: Props) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPage, setViewerPage] = useState(0);
  const { adminMode } = useAdminMode();
  const [isPending, startTransition] = useTransition();
  const [visionFeedback, setVisionFeedback] = useState<string | null>(null);

  const hasPages = originalPages.length > 0 || !!gallicaUrl;

  function handleVisionTranscribe() {
    // Transcribe page 0 (the feuilleton is on page 1 of the issue; index 0)
    setVisionFeedback("Transcribing…");
    startTransition(async () => {
      try {
        const result = await visionTranscribe(installmentDate, 0);
        setVisionFeedback(
          `Done — ${result.char_count} chars (${result.model})`,
        );
      } catch (err) {
        setVisionFeedback(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  return (
    <>
      <Panel>
        <StripLabel>The Very Strip · Débats, {dateLabel}</StripLabel>

        <ScanFrame>
          {stripImage ? (
            <ScanImg
              src={stripImage.url}
              alt={stripImage.caption || "Feuilleton strip scan"}
            />
          ) : (
            <Placeholder>
              <PlaceholderText>Original on Gallica</PlaceholderText>
              {gallicaUrl && (
                <GallicaPlaceholderLink
                  href={gallicaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on gallica.bnf.fr ↗
                </GallicaPlaceholderLink>
              )}
            </Placeholder>
          )}
        </ScanFrame>

        <Attribution>Source: gallica.bnf.fr / BnF</Attribution>

        <ViewScanBtn
          onClick={() => { setViewerPage(0); setViewerOpen(true); }}
          disabled={!hasPages}
          title={!hasPages ? "Full scans not yet available" : undefined}
        >
          View full page scan ⤢
        </ViewScanBtn>

        {adminMode && (
          <>
            <VisionBtn
              onClick={handleVisionTranscribe}
              disabled={isPending || !originalPages.length}
              title={
                !originalPages.length
                  ? "Page scans required for vision transcription"
                  : "Transcribe page 1 with the vision model and store as an alternate French source"
              }
            >
              Transcribe with vision ↻
            </VisionBtn>
            {visionFeedback && <VisionFeedback>{visionFeedback}</VisionFeedback>}
          </>
        )}
      </Panel>

      {viewerOpen && (
        <ScanViewer
          pages={originalPages}
          gallicaUrl={gallicaUrl}
          currentPage={viewerPage}
          onClose={() => setViewerOpen(false)}
          onPageChange={setViewerPage}
        />
      )}
    </>
  );
}
