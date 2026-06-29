"use client";

import { useMemo, useState } from "react";
import styled from "styled-components";
import type { DayPageData } from "@/lib/content";
import type { ResolvedDocItem, ResolvedImageItem } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import { TabSection, TabSectionTitle, EmptyState, renderItems } from "./TabPrimitives";
import AdminItemList from "@/components/admin/AdminItemList";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import ScanViewer from "./ScanViewer";
import { cleanGalignaniOcr } from "@/lib/galignani/clean-ocr";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
}

const PageGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-width: 520px;
`;

const PageThumb = styled.button`
  border: 2px solid var(--rule-light);
  background: var(--paper-card);
  padding: 4px;
  cursor: zoom-in;
  transition: border-color 0.15s;

  &:hover { border-color: var(--gilt-warm); }

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

const Blurb = styled.p`
  font-family: var(--font-body-stack);
  font-size: 15px;
  line-height: 1.6;
  color: var(--ink-secondary);
  max-width: 640px;
  margin: 0 0 16px;
`;

/** Collapsible disclosure for the rough machine transcription. */
const OcrDetails = styled.details`
  border-top: 1px solid var(--rule-light);
  padding-top: 14px;

  summary {
    font-family: var(--font-labels-stack);
    font-style: italic;
    font-size: 13px;
    color: var(--ink-secondary);
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker { display: none; }
  summary::before { content: "▸ "; color: var(--ink-muted); }
  &[open] summary::before { content: "▾ "; }
`;

const OcrCaveat = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
  margin: 8px 0 16px;
  max-width: 640px;
`;

const GallicaTip = styled.span`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  width: 220px;
  background: var(--parchment-dark, #f5efe0);
  border: 1px solid rgba(185, 165, 120, 0.4);
  border-radius: 4px;
  padding: 0.5rem 0.65rem;
  font-family: var(--font-tooltip-body-stack, serif);
  font-size: 0.75rem;
  font-style: normal;
  line-height: 1.45;
  color: var(--ink-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.14s ease;
  z-index: 10;

  &::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: rgba(185, 165, 120, 0.4);
  }
`;

const GallicaLink = styled.a`
  position: relative;
  display: inline;

  &:hover ${GallicaTip},
  &:focus-visible ${GallicaTip} {
    opacity: 1;
  }
`;

/** Return a copy of the items with Galignani OCR text run through the cleaner. */
function withCleanedText(items: ResolvedDocItem[]): ResolvedDocItem[] {
  return items.map((item) =>
    item.kind === "text"
      ? { ...item, text: cleanGalignaniOcr(item.text) }
      : item,
  );
}

export default function GalignaniTab({ data, contributors }: Props) {
  const { resolved, doc, installment_date } = data;
  const { adminMode } = useAdminMode();
  const items = resolved.galignani;

  const scans = useMemo(
    () => items.filter((i): i is ResolvedImageItem => i.kind === "image"),
    [items],
  );
  // Reader-facing OCR text pages, with cleaned text. (Images live in `scans`.)
  const textItems = useMemo(
    () => withCleanedText(items.filter((i) => i.kind !== "image")),
    [items],
  );

  const gallicaUrl =
    (textItems.find((i) => i.kind === "text" && i.gallica_url) as
      | { gallica_url?: string }
      | undefined)?.gallica_url ??
    doc.gallica_issue_url ??
    null;

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerPage, setViewerPage] = useState(0);

  if (items.length === 0) {
    // Galignani's Messenger did not publish on Sundays — surface that as the
    // reason for an empty edition rather than the generic "being prepared" copy.
    const isSunday =
      new Date(`${installment_date}T00:00:00Z`).getUTCDay() === 0;
    return (
      <TabSection>
        <AdminItemList
          date={installment_date}
          section="galignani"
          rawItems={doc.galignani}
          resolvedItems={[]}
          contributors={contributors}
          emptyMessage={
            <EmptyState>
              {isSunday
                ? "No edition of Galignani’s Messenger was published on Sundays."
                : "Galignani’s Messenger coverage for this date is being prepared."}
            </EmptyState>
          }
        />
      </TabSection>
    );
  }

  // Admin mode needs the full, index-aligned section (scans + text) so that
  // drag-reorder / delete operate on the correct DocItem positions. Readers get
  // the curated split layout below instead.
  if (adminMode) {
    return (
      <TabSection>
        <AdminItemList
          date={installment_date}
          section="galignani"
          rawItems={doc.galignani}
          resolvedItems={withCleanedText(items)}
          contributors={contributors}
        />
      </TabSection>
    );
  }

  return (
    <TabSection>
      {/* 1. Page scans — clickable to zoom and read the original. */}
      {scans.length > 0 && (
        <div>
          <TabSectionTitle>Galignani&apos;s Messenger</TabSectionTitle>
          <Blurb>
            An English-language daily published in Paris from 1814, read by the
            city&apos;s British and American residents and travellers. It
            reprinted the latest news from the London papers alongside Continental
            affairs and was the English-speaking world&apos;s window onto Paris.
          </Blurb>
          <PageGrid>
            {scans.map((page, i) => (
              <div key={i}>
                <PageThumb
                  onClick={() => {
                    setViewerPage(i);
                    setViewerOpen(true);
                  }}
                  aria-label={`Open page ${i + 1} scan`}
                >
                  <img src={page.url} alt={page.caption || `Page ${i + 1}`} />
                </PageThumb>
                <ThumbLabel>Page {i + 1}</ThumbLabel>
              </div>
            ))}
          </PageGrid>
        </div>
      )}

      {/* 2. OCR transcription — rough, machine-generated, collapsed by default. */}
      {textItems.length > 0 && (
        <OcrDetails>
          <summary>Rough transcription (machine OCR)</summary>
          <OcrCaveat>
            This transcription was pulled from the{" "}
            <GallicaLink href="https://gallica.bnf.fr" target="_blank" rel="noopener noreferrer">
              Gallica
              <GallicaTip role="tooltip">
                Gallica is the digital library of the Bibliothèque nationale de
                France (BnF), providing free access to millions of historical
                documents, newspapers, and books.
              </GallicaTip>
            </GallicaLink>{" "}
            website and was derived from the page scans above. Column order and
            spelling are imperfect on this dense broadsheet; click a scan to
            read the original.
          </OcrCaveat>
          {renderItems(textItems, contributors)}
        </OcrDetails>
      )}

      {viewerOpen && (
        <ScanViewer
          pages={scans}
          gallicaUrl={gallicaUrl}
          currentPage={viewerPage}
          onClose={() => setViewerOpen(false)}
          onPageChange={setViewerPage}
          label="Galignani's Messenger"
        />
      )}
    </TabSection>
  );
}
