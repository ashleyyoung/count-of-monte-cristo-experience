"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import styled from "styled-components";
import type { DayPageData } from "@/lib/content";
import ScanViewer from "./ScanViewer";
import { EmptyState } from "./TabPrimitives";
import MissingIssueNote from "./MissingIssueNote";
import { isMissingGallicaIssue } from "@/lib/missing-issues";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import { visionTranscribe, setOriginalPageImage } from "@/app/actions/admin";
import MediaUploadField from "@/components/admin/primitives/MediaUploadField";
import { extractArk, iiifPageImageUrl } from "@/lib/gallica-links";

interface Props {
  data: DayPageData;
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const PageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
`;

const PageThumb = styled.button<{ $active: boolean }>`
  border: 2px solid ${({ $active }) => ($active ? "var(--gilt-warm)" : "var(--rule-light)")};
  background: var(--paper-card);
  padding: 4px;
  cursor: pointer;
  transition: border-color 0.15s;

  &:hover { border-color: var(--rule-mid); }

  img { width: 100%; height: auto; display: block; }
`;

const ThumbLabel = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  color: var(--ink-muted);
  text-align: center;
  margin: 4px 0 0;
`;

const VisionBtn = styled.button<{ $loading: boolean }>`
  display: block;
  width: 100%;
  margin-top: 4px;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  padding: 4px 6px;
  background: ${({ $loading }) => ($loading ? "var(--rule-mid)" : "var(--oxblood)")};
  color: var(--paper-base);
  border: none;
  cursor: ${({ $loading }) => ($loading ? "wait" : "pointer")};
  transition: background 0.15s;
  letter-spacing: 0.04em;

  &:hover:not(:disabled) {
    background: var(--ink-primary);
  }
`;

const VisionFeedback = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  color: var(--oxblood);
  text-align: center;
  margin: 3px 0 0;
`;

const GallicaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--paper-feature);
  border: 1px solid var(--rule-light);
`;

const GallicaLabel = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-muted);
  flex: 1;
`;

const GallicaLink = styled.a`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  padding: 8px 16px;
  background: var(--ink-primary);
  color: var(--paper-card);
  text-decoration: none;
  transition: background 0.15s;

  &:hover {
    background: var(--oxblood);
    color: var(--paper-base);
  }
`;

const RecoveryLink = styled.a`
  display: block;
  text-align: center;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 9px;
  letter-spacing: 0.04em;
  color: var(--ink-muted);
  margin-top: 4px;

  &:hover {
    color: var(--gilt-deep);
  }
`;

const MissingPageThumb = styled.div`
  border: 1px dashed var(--rule-mid);
  background: var(--paper-feature);
  padding: 4px;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  color: var(--ink-muted);
  text-align: center;
`;

const OpenViewerBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  padding: 10px 20px;
  background: var(--ink-primary);
  color: var(--paper-card);
  border: none;
  cursor: pointer;
  transition: background 0.15s;
  align-self: flex-start;

  &:hover { background: var(--oxblood); }
`;

export default function OriginalPaperTab({ data }: Props) {
  const { original_pages } = data.resolved;
  const gallicaUrl = data.doc.gallica_issue_url;
  const ark = gallicaUrl ? extractArk(gallicaUrl) : null;
  const pageCount = Math.max(
    data.doc.gallica_page_count ?? 4,
    original_pages.length,
  );
  const router = useRouter();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPage, setViewerPage] = useState(0);
  const { adminMode } = useAdminMode();
  const [isPending, startTransition] = useTransition();
  const [visionStatus, setVisionStatus] = useState<Record<number, string>>({});
  const [uploadStatus, setUploadStatus] = useState<Record<number, string>>({});

  function handleVisionTranscribe(pageIndex: number) {
    setVisionStatus((s) => ({ ...s, [pageIndex]: "Transcribing…" }));
    startTransition(async () => {
      try {
        const result = await visionTranscribe(data.installment_date, pageIndex);
        setVisionStatus((s) => ({
          ...s,
          [pageIndex]: `Done — ${result.char_count} chars (${result.model})`,
        }));
      } catch (err) {
        setVisionStatus((s) => ({
          ...s,
          [pageIndex]: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }));
      }
    });
  }

  function handlePageUploaded(
    pageIndex: number,
    result: { id: string; r2_key: string },
  ) {
    startTransition(async () => {
      try {
        await setOriginalPageImage(data.installment_date, pageIndex, result.id);
        setUploadStatus((s) => ({ ...s, [pageIndex]: "Saved." }));
        router.refresh();
      } catch (err) {
        setUploadStatus((s) => ({
          ...s,
          [pageIndex]: `Error: ${err instanceof Error ? err.message : String(err)}`,
        }));
      }
    });
  }

  return (
    <Wrapper>
      {/* Gallica link — always shown when available */}
      {gallicaUrl && (
        <GallicaRow>
          <GallicaLabel>
            View the full original issue on Gallica / Bibliothèque nationale de France
          </GallicaLabel>
          <GallicaLink href={gallicaUrl} target="_blank" rel="noopener noreferrer">
            Open on Gallica ↗
          </GallicaLink>
        </GallicaRow>
      )}

      {original_pages.length > 0 || (adminMode && ark) ? (
        <>
          <PageGrid>
            {Array.from({ length: pageCount }, (_, i) => i).map((i) => {
              const page = original_pages[i];
              return (
                <div key={i}>
                  {page ? (
                    <PageThumb
                      $active={viewerOpen && viewerPage === i}
                      onClick={() => { setViewerPage(i); setViewerOpen(true); }}
                      aria-label={`Open page ${i + 1} scan`}
                    >
                      <img src={page.url} alt={page.caption || `Page ${i + 1}`} />
                    </PageThumb>
                  ) : (
                    <MissingPageThumb>Page {i + 1} — not yet pulled</MissingPageThumb>
                  )}
                  <ThumbLabel>Page {i + 1}</ThumbLabel>
                  {adminMode && page && (
                    <>
                      <VisionBtn
                        $loading={isPending && visionStatus[i] === "Transcribing…"}
                        disabled={isPending}
                        onClick={() => handleVisionTranscribe(i)}
                        title="Transcribe this page with the vision model and store as an alternate French source"
                      >
                        Transcribe with vision ↻
                      </VisionBtn>
                      {visionStatus[i] && (
                        <VisionFeedback>{visionStatus[i]}</VisionFeedback>
                      )}
                    </>
                  )}
                  {adminMode && ark && (
                    <>
                      <RecoveryLink
                        href={iiifPageImageUrl(ark, i + 1)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View page {i + 1} on Gallica ↗
                      </RecoveryLink>
                      <MediaUploadField
                        kind="scan"
                        onUploaded={(result) => handlePageUploaded(i, result)}
                      />
                      {uploadStatus[i] && (
                        <VisionFeedback>{uploadStatus[i]}</VisionFeedback>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </PageGrid>
          {original_pages.length > 0 && (
            <OpenViewerBtn onClick={() => { setViewerPage(0); setViewerOpen(true); }}>
              Open full scan viewer ⤢
            </OpenViewerBtn>
          )}
        </>
      ) : isMissingGallicaIssue(data.installment_date) ? (
        <MissingIssueNote />
      ) : (
        <EmptyState>
          Full-page scans for this issue are being sourced from Gallica / BnF.
          {gallicaUrl && (
            <> The original is available{" "}
              <a href={gallicaUrl} target="_blank" rel="noopener noreferrer">on Gallica ↗</a>.
            </>
          )}
        </EmptyState>
      )}

      {viewerOpen && (
        <ScanViewer
          pages={original_pages}
          gallicaUrl={gallicaUrl}
          currentPage={viewerPage}
          onClose={() => setViewerOpen(false)}
          onPageChange={setViewerPage}
        />
      )}
    </Wrapper>
  );
}
