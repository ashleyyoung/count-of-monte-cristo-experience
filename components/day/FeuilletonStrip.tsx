"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import styled from "styled-components";
import type { ResolvedImageItem } from "@/lib/content";
import ScanViewer from "./ScanViewer";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import { visionTranscribe, setFeuilletonStripImage } from "@/app/actions/admin";
import MediaUploadField from "@/components/admin/primitives/MediaUploadField";
import { extractArk, iiifPageImageUrl } from "@/lib/gallica-links";

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
  align-self: start;
  position: sticky;
  top: 0;
  max-height: 100vh;
  overflow-y: auto;
`;

const StripLabel = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
`;

const ThumbnailStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const ScanFrame = styled.div`
  border: 1px solid var(--rule-mid);
  background: var(--paper-card);
  box-shadow: inset 0 0 30px rgba(120, 84, 40, 0.18);
  padding: 6px;
  width: 100%;
`;

const ScanImg = styled.img`
  width: 100%;
  height: auto;
  display: block;
`;

const PageThumbBtn = styled.button`
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }
`;

const PageThumbLabel = styled.span`
  display: block;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  color: var(--ink-muted);
  letter-spacing: 0.08em;
  text-align: center;
  margin-top: 4px;
`;

const Placeholder = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
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

const RecoveryLink = styled.a`
  display: block;
  text-align: center;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--ink-muted);
  margin-top: 6px;

  &:hover {
    color: var(--gilt-deep);
  }
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
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const router = useRouter();
  const ark = gallicaUrl ? extractArk(gallicaUrl) : null;

  const hasPages = originalPages.length > 0 || !!gallicaUrl;
  const viewerPages = stripImage
    ? [stripImage, ...originalPages]
    : originalPages;
  const stripViewerIndex = stripImage ? 0 : -1;
  const fullPageViewerIndex = stripImage ? 1 : 0;

  function openViewer(pageIndex: number) {
    setViewerPage(pageIndex);
    setViewerOpen(true);
  }

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

  function handleStripUploaded(result: { id: string; r2_key: string }) {
    setUploadFeedback("Saving…");
    startTransition(async () => {
      try {
        await setFeuilletonStripImage(installmentDate, result.id);
        setUploadFeedback("Saved.");
        router.refresh();
      } catch (err) {
        setUploadFeedback(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  return (
    <>
      <Panel>
        <StripLabel>The Very Strip · Débats, {dateLabel}</StripLabel>

        <ThumbnailStack>
          {stripImage ? (
            <div>
              <PageThumbBtn
                type="button"
                onClick={() => openViewer(stripViewerIndex)}
                aria-label="Open feuilleton strip scan"
              >
                <ScanFrame>
                  <ScanImg
                    src={stripImage.url}
                    alt={stripImage.caption || "Feuilleton strip scan"}
                  />
                </ScanFrame>
              </PageThumbBtn>
            </div>
          ) : (
            <ScanFrame>
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
            </ScanFrame>
          )}

          {originalPages.map((page, i) => (
            <div key={i}>
              <PageThumbBtn
                type="button"
                onClick={() => openViewer(stripImage ? i + 1 : i)}
                aria-label={`Open page ${i + 1} scan`}
              >
                <ScanFrame>
                  <ScanImg
                    src={page.url}
                    alt={page.caption || `Page ${i + 1}`}
                  />
                </ScanFrame>
              </PageThumbBtn>
              <PageThumbLabel>Page {i + 1}</PageThumbLabel>
            </div>
          ))}
        </ThumbnailStack>

        <Attribution>Source: gallica.bnf.fr / BnF</Attribution>

        <ViewScanBtn
          onClick={() => openViewer(fullPageViewerIndex)}
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
            {ark && (
              <>
                <RecoveryLink
                  href={iiifPageImageUrl(ark, 1)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View page 1 on Gallica ↗
                </RecoveryLink>
                <MediaUploadField kind="scan" onUploaded={handleStripUploaded} />
                {uploadFeedback && <VisionFeedback>{uploadFeedback}</VisionFeedback>}
              </>
            )}
          </>
        )}
      </Panel>

      {viewerOpen && (
        <ScanViewer
          pages={viewerPages}
          gallicaUrl={gallicaUrl}
          currentPage={viewerPage}
          onClose={() => setViewerOpen(false)}
          onPageChange={setViewerPage}
          leadingStrip={!!stripImage}
        />
      )}
    </>
  );
}
