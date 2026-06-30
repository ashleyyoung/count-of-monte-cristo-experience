"use client";

/**
 * Shared primitives for tab content rendering.
 * Each tab imports from here to stay DRY.
 */

import styled from "styled-components";
import type { ResolvedDocItem } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import ContributorByline from "./ContributorByline";
import Cite, { type CiteSource } from "@/components/ui/Cite";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import TranslationHistory from "@/components/admin/TranslationHistory";
import type { DayContentSection } from "@/lib/types/day-content-section";
import {
  pickProseRenderer,
  renderProseParagraphs,
} from "@/lib/render-prose";
import { usePeopleLinkPlain } from "@/lib/people-linker";
import { stripChapterHeading } from "@/lib/book";

// ---------------------------------------------------------------------------
// Base layout
// ---------------------------------------------------------------------------

export const TabSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 28px;
`;

export const TabSectionTitle = styled.h3`
  font-family: var(--font-display-stack);
  font-style: italic;
  font-size: 18px;
  font-weight: 400;
  color: var(--ink-secondary);
  margin: 0;
  border-bottom: 1px solid var(--rule-light);
  padding-bottom: 6px;
`;

export const ProseBlock = styled.div`
  font-family: var(--font-body-stack);
  font-size: 17px;
  line-height: 1.68;
  color: var(--ink-secondary);
  max-width: 640px;

  p + p { margin-top: 1em; }
  p { margin: 0; }
`;

export const EmptyState = styled.p`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 15px;
  color: var(--ink-muted);
  margin: 0;
`;

export const SourceLink = styled.a`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
  text-decoration: underline;
  text-underline-offset: 2px;
  display: inline-block;
  margin-top: 6px;

  &:hover { color: var(--oxblood); }
`;
export const ImageBlock = styled.figure`
  margin: 0;
  max-width: 480px;

  figcaption {
    font-family: var(--font-labels-stack);
    font-style: italic;
    font-size: 11px;
    color: var(--ink-muted);
    margin-top: 6px;
  }
`;

export const BlockImage = styled.img`
  width: 100%;
  height: auto;
  border: 1px solid var(--rule-light);
  display: block;
`;

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

export interface AdminItemContext {
  /** The installment date (YYYY-MM-DD) for history lookups. */
  date: string;
  /** The section key (e.g. "debats.music") for history lookups. */
  section: DayContentSection;
  /**
   * Whether to show "Compare translations" label on the history pill for
   * chapter items (the Gutenberg vs Claude comparison affordance).
   */
  isChapter?: boolean;
}

/**
 * Render a list of DocItems. Pass adminContext to enable the admin
 * TranslationHistory pill on text items.
 */
export function renderItems(
  items: ResolvedDocItem[],
  contributors?: Map<string, ContributorInfo>,
  adminContext?: AdminItemContext,
) {
  if (items.length === 0) return null;

  return items.map((item, i) => {
    if (item.kind === "text") {
      const contributor = item.contributor_id && contributors
        ? contributors.get(item.contributor_id) ?? null
        : null;

      // Build a CiteSource from item provenance.
      const citeSource: CiteSource = {
        title: item.source ?? "Journal des Débats",
        attribution: item.attribution ?? (item.original_date ? `Published ${item.original_date}` : ""),
        license: item.license,
        source_text_url: item.source_text_url ?? item.gallica_url,
        translator: item.translator,
        translation_source_url: item.translation_source_url,
      };

      return (
        <TextItemWrapper
          key={i}
          item={item}
          contributor={contributor}
          citeSource={citeSource}
          citeN={i + 1}
          adminContext={adminContext}
        />
      );
    }

    if (item.kind === "image") {
      return (
        <ImageBlock key={i}>
          <BlockImage src={item.url} alt={item.caption} />
          {item.caption && <figcaption>{item.caption}</figcaption>}
        </ImageBlock>
      );
    }

    if (item.kind === "audio") {
      return (
        <div key={i}>
          <audio controls src={item.url} style={{ width: "100%" }} />
          <p style={{ fontFamily: "var(--font-labels-stack)", fontStyle: "italic", fontSize: 11, color: "var(--ink-muted)", margin: "4px 0 0" }}>
            {item.work_title} — {item.composer} · {item.audio_license}
          </p>
        </div>
      );
    }

    return null;
  });
}

/** Internal component for a single text item — uses hooks for admin mode. */
function TextItemWrapper({
  item,
  contributor,
  citeSource,
  citeN,
  adminContext,
}: {
  item: import("@/lib/content").ResolvedTextItem;
  contributor: ContributorInfo | null;
  citeSource: CiteSource;
  citeN: number;
  adminContext?: AdminItemContext;
}) {
  const { adminMode } = useAdminMode();

  const showHistory =
    adminMode &&
    adminContext &&
    item.slot_key;

  const historyLabel =
    adminContext?.isChapter &&
    (item.translation_origin === "existing_published" ||
      item.translation_origin === "staff_translation")
      ? "Compare translations"
      : undefined;

  const linkPlain = usePeopleLinkPlain({ enabled: !adminContext?.isChapter });
  const renderInline = pickProseRenderer(item.translation_origin, linkPlain);
  const displayText = adminContext?.isChapter
    ? stripChapterHeading(item.text) ?? item.text
    : item.text;

  return (
    <div>
      {showHistory && (
        <div style={{ marginBottom: 8 }}>
          <TranslationHistory
            date={adminContext.date}
            section={adminContext.section}
            slotKey={item.slot_key!}
            currentVersionId={item.translation_version_id}
            currentText={item.text}
            currentAttribution={item.attribution}
            currentTranslationOrigin={item.translation_origin}
            label={historyLabel}
          />
        </div>
      )}
      <ProseBlock>
        {renderProseParagraphs(displayText, renderInline)}
      </ProseBlock>
      {contributor && (
        <ContributorByline contributor={contributor} />
      )}
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 2, marginTop: 6 }}>
        <Cite source={citeSource} n={citeN} />
      </span>
    </div>
  );
}
