"use client";

/**
 * components/admin/TranslationHistory.tsx
 *
 * Admin-only translation history panel for a text item.
 *
 * Renders a small Pinyon Script "history" pill next to the item's <Cite> marker.
 * Opens a side panel listing all translation_versions rows for the item's slot_key,
 * with compare (side-by-side EN/EN + FR source), promote-to-current, and delete.
 *
 * For the chapter feuilleton, label="Compare translations" is used as the pill text
 * to surface the Gutenberg vs Claude comparison affordance.
 */

import { useState, useTransition } from "react";
import styled from "styled-components";
import {
  getTranslationVersions,
  getVersionText,
  getVersionPageFrench,
  promoteTranslationVersion,
  deleteTranslationVersion,
} from "@/app/actions/translation-versions";
import type { DayContentSection } from "@/lib/types/day-content-section";
import type { TranslationVersionMeta } from "@/lib/types/translation-versions";
import {
  pickProseRenderer,
  renderProseParagraphs,
} from "@/lib/render-prose";
import { usePeopleLinkPlain } from "@/lib/people-linker";

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const HistoryPill = styled.button`
  font-family: "Pinyon Script", cursive;
  font-size: 14px;
  color: var(--oxblood);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 0 0 6px;
  line-height: 1;
  opacity: 0.75;
  transition: opacity 0.15s;
  vertical-align: middle;

  &:hover {
    opacity: 1;
  }
`;

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(20, 14, 6, 0.55);
  z-index: 200;
  display: flex;
  justify-content: flex-end;
`;

const Panel = styled.aside`
  width: min(760px, 95vw);
  height: 100vh;
  background: var(--paper-feature);
  border-left: 3px double var(--rule-mid);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--rule-mid);
  flex-shrink: 0;
`;

const PanelTitle = styled.h2`
  font-family: var(--font-display-stack);
  font-style: italic;
  font-weight: 400;
  font-size: 17px;
  color: var(--ink-primary);
  margin: 0;
`;

const CloseBtn = styled.button`
  font-family: var(--font-labels-stack);
  font-size: 20px;
  background: none;
  border: none;
  color: var(--ink-muted);
  cursor: pointer;
  line-height: 1;
  padding: 0;

  &:hover { color: var(--oxblood); }
`;

const PanelBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const VersionCard = styled.div<{ $isLive: boolean }>`
  border: 1px solid ${({ $isLive }) => ($isLive ? "var(--gilt-warm)" : "var(--rule-light)")};
  background: ${({ $isLive }) => ($isLive ? "var(--paper-card)" : "var(--paper-base)")};
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const VersionMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
`;

const Badge = styled.span<{ $variant?: "live" | "challenger" | "published" }>`
  font-family: var(--font-labels-stack);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 2px 7px;
  border: 1px solid;
  color: ${({ $variant }) =>
    $variant === "live"
      ? "var(--gilt-warm)"
      : $variant === "published"
        ? "var(--oxblood)"
        : "var(--ink-muted)"};
  border-color: ${({ $variant }) =>
    $variant === "live"
      ? "var(--gilt-warm)"
      : $variant === "published"
        ? "var(--oxblood)"
        : "var(--rule-mid)"};
`;

const MetaText = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
`;

const ActionRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const SmallBtn = styled.button<{ $destructive?: boolean }>`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  padding: 4px 12px;
  border: 1px solid ${({ $destructive }) =>
    $destructive ? "var(--oxblood)" : "var(--rule-mid)"};
  background: none;
  color: ${({ $destructive }) =>
    $destructive ? "var(--oxblood)" : "var(--ink-secondary)"};
  cursor: pointer;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: ${({ $destructive }) =>
      $destructive ? "var(--oxblood)" : "var(--ink-primary)"};
    color: var(--paper-base);
    border-color: ${({ $destructive }) =>
      $destructive ? "var(--oxblood)" : "var(--ink-primary)"};
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
`;

const CompareGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 8px;
`;

const ComparePane = styled.div`
  border: 1px solid var(--rule-light);
  background: var(--paper-card);
  padding: 12px;
  overflow-y: auto;
  max-height: 400px;
`;

const ComparePaneLabel = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin: 0 0 8px;
`;

const ComparePaneText = styled.div`
  font-family: var(--font-body-stack);
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-secondary);

  p + p {
    margin-top: 1em;
  }
  p {
    margin: 0;
  }
`;

const ComparePaneTextPlain = styled.div`
  font-family: var(--font-body-stack);
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink-secondary);
  white-space: pre-wrap;
`;

const FRSourcePane = styled.div`
  grid-column: 1 / -1;
  border: 1px solid var(--rule-light);
  background: var(--paper-base);
  padding: 12px;
  overflow-y: auto;
  max-height: 220px;
`;

const LoadingText = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-muted);
  text-align: center;
  padding: 20px 0;
`;

const ErrorText = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  color: var(--oxblood);
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function originLabel(origin: string): string {
  switch (origin) {
    case "machine_claude":
      return "Machine (Claude)";
    case "existing_published":
      return "Published translation";
    case "staff_translation":
      return "Staff translation";
    default:
      return origin;
  }
}

// ---------------------------------------------------------------------------
// Compare panel
// ---------------------------------------------------------------------------

interface CompareState {
  versionId: string;
  liveText: string;
  versionText: string;
  frText: string | null;
}

function ComparePanel({
  compare,
  liveAttribution,
  liveTranslationOrigin,
  version,
  onClose,
}: {
  compare: CompareState;
  liveAttribution: string;
  liveTranslationOrigin?: string;
  version: TranslationVersionMeta;
  onClose: () => void;
}) {
  const linkPlain = usePeopleLinkPlain();
  const liveRenderer = pickProseRenderer(liveTranslationOrigin, linkPlain);
  const versionRenderer = pickProseRenderer(version.translation_origin, linkPlain);

  return (
    <div>
      <ActionRow style={{ marginBottom: 8 }}>
        <SmallBtn onClick={onClose}>← Close compare</SmallBtn>
      </ActionRow>
      <CompareGrid>
        <ComparePane>
          <ComparePaneLabel>Live — {liveAttribution}</ComparePaneLabel>
          <ComparePaneText>
            {renderProseParagraphs(compare.liveText, liveRenderer)}
          </ComparePaneText>
        </ComparePane>
        <ComparePane>
          <ComparePaneLabel>
            {originLabel(version.translation_origin)} ·{" "}
            {version.model_used ?? version.translator ?? "unknown"} ·{" "}
            {formatDate(version.translated_at)}
          </ComparePaneLabel>
          <ComparePaneText>
            {renderProseParagraphs(compare.versionText, versionRenderer)}
          </ComparePaneText>
        </ComparePane>
        {compare.frText && (
          <FRSourcePane>
            <ComparePaneLabel>French source (admin only)</ComparePaneLabel>
            <ComparePaneTextPlain>{compare.frText}</ComparePaneTextPlain>
          </FRSourcePane>
        )}
      </CompareGrid>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  date: string;
  section: DayContentSection;
  slotKey: string;
  currentVersionId?: string;
  /** The already-resolved live English text (avoids a convention-based R2 refetch). */
  currentText?: string;
  currentAttribution?: string;
  /** Live item translation_origin — selects the prose inline renderer in compare. */
  currentTranslationOrigin?: string;
  /** Custom pill label (e.g. "Compare translations" for chapter) */
  label?: string;
  /** Prefetched version count for the pill label (e.g. "history (3)"). */
  versionCount?: number;
}

export default function TranslationHistory({
  date,
  section,
  slotKey,
  currentVersionId,
  currentText,
  currentAttribution,
  currentTranslationOrigin,
  label,
  versionCount,
}: Props) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<TranslationVersionMeta[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [compare, setCompare] = useState<CompareState | null>(null);
  const [compareVersion, setCompareVersion] = useState<TranslationVersionMeta | null>(null);
  const [isPending, startTransition] = useTransition();
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  function openPanel() {
    setOpen(true);
    setVersions(null);
    setLoadError(null);
    setCompare(null);
    setActionFeedback(null);
    startTransition(async () => {
      try {
        const rows = await getTranslationVersions(date, section, slotKey);
        setVersions(rows);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  function handleOpenCompare(version: TranslationVersionMeta) {
    // For full-page translations the fr_intermediate is the whole stitched issue;
    // show only the matching page so the French panel stays readable.
    const pageMatch =
      section === "translated_pages"
        ? slotKey.match(/^paper-page-(\d+)$/)
        : null;
    const pageNumber = pageMatch ? parseInt(pageMatch[1], 10) : null;

    startTransition(async () => {
      try {
        const [versionText, frText] = await Promise.all([
          getVersionText(version.text_r2_key),
          version.fr_intermediate_r2_key
            ? pageNumber != null
              ? getVersionPageFrench(version.fr_intermediate_r2_key, pageNumber)
              : getVersionText(version.fr_intermediate_r2_key)
            : Promise.resolve(null),
        ]);

        const liveText = currentText ?? "(live text not available)";

        setCompare({ versionId: version.id, liveText, versionText, frText });
        setCompareVersion(version);
      } catch (err) {
        setActionFeedback(
          `Compare failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  function handlePromote(version: TranslationVersionMeta) {
    if (
      !confirm(
        `Promote this ${originLabel(version.translation_origin)} version to live? ` +
          `The current live text will be snapshotted first.`,
      )
    )
      return;

    startTransition(async () => {
      try {
        await promoteTranslationVersion(version.id, date, section, slotKey);
        setActionFeedback(`Promoted: ${formatDate(version.translated_at)}`);
        // Reload versions
        const rows = await getTranslationVersions(date, section, slotKey);
        setVersions(rows);
      } catch (err) {
        setActionFeedback(
          `Promote failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  function handleDelete(version: TranslationVersionMeta) {
    if (version.id === currentVersionId) {
      alert(
        "Cannot delete the live version. Promote another version first, then delete this one.",
      );
      return;
    }
    if (!confirm("Hard-delete this version row? This cannot be undone.")) return;

    startTransition(async () => {
      try {
        await deleteTranslationVersion(version.id);
        setVersions((prev) => prev?.filter((v) => v.id !== version.id) ?? null);
        if (compare?.versionId === version.id) setCompare(null);
      } catch (err) {
        setActionFeedback(
          `Delete failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });
  }

  const pillLabel =
    versionCount != null && versionCount > 0
      ? `${label ?? "history"} (${versionCount})`
      : (label ?? "history");

  return (
    <>
      <HistoryPill
        onClick={openPanel}
        title={`Translation history for slot ${slotKey}`}
        aria-label="Open translation history"
      >
        {pillLabel}
      </HistoryPill>

      {open && (
        <Overlay onClick={() => setOpen(false)}>
          <Panel onClick={(e) => e.stopPropagation()}>
            <PanelHeader>
              <PanelTitle>Translation history · {slotKey}</PanelTitle>
              <CloseBtn onClick={() => setOpen(false)} aria-label="Close">×</CloseBtn>
            </PanelHeader>

            <PanelBody>
              {actionFeedback && <ErrorText>{actionFeedback}</ErrorText>}

              {compare && compareVersion ? (
                <ComparePanel
                  compare={compare}
                  liveAttribution={currentAttribution ?? "Live version"}
                  liveTranslationOrigin={currentTranslationOrigin}
                  version={compareVersion}
                  onClose={() => { setCompare(null); setCompareVersion(null); }}
                />
              ) : loadError ? (
                <ErrorText>Failed to load versions: {loadError}</ErrorText>
              ) : versions === null ? (
                <LoadingText>Loading translation history…</LoadingText>
              ) : versions.length === 0 ? (
                <LoadingText>
                  No translation history yet for this item. Run a translation to populate.
                </LoadingText>
              ) : (
                versions.map((v) => {
                  const isLive = v.id === currentVersionId;
                  const isPublished = v.translation_origin === "existing_published";
                  return (
                    <VersionCard key={v.id} $isLive={isLive}>
                      <VersionMeta>
                        {isLive && <Badge $variant="live">Live</Badge>}
                        {isPublished && (
                          <Badge $variant="published">Published</Badge>
                        )}
                        {!isLive && !isPublished && (
                          <Badge $variant="challenger">Challenger</Badge>
                        )}
                        <MetaText>{originLabel(v.translation_origin)}</MetaText>
                        {v.model_used && (
                          <MetaText>· {v.model_used}</MetaText>
                        )}
                        {v.translator && (
                          <MetaText>· Trans. {v.translator}</MetaText>
                        )}
                        {v.cost_usd != null && (
                          <MetaText>· ${v.cost_usd.toFixed(4)}</MetaText>
                        )}
                        {v.low_confidence && (
                          <Badge $variant="challenger">Low confidence</Badge>
                        )}
                        <MetaText style={{ marginLeft: "auto" }}>
                          {formatDate(v.translated_at)}
                        </MetaText>
                      </VersionMeta>
                      {v.admin_notes && (
                        <MetaText style={{ fontStyle: "italic", color: "var(--oxblood)" }}>
                          {v.admin_notes}
                        </MetaText>
                      )}
                      {v.translation_source_url && (
                        <MetaText>
                          Source:{" "}
                          <a
                            href={v.translation_source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--ink-muted)", textDecoration: "underline" }}
                          >
                            {v.translation_source_url}
                          </a>
                        </MetaText>
                      )}
                      <ActionRow>
                        <SmallBtn
                          onClick={() => handleOpenCompare(v)}
                          disabled={isPending}
                        >
                          Compare
                        </SmallBtn>
                        {!isLive && (
                          <SmallBtn
                            onClick={() => handlePromote(v)}
                            disabled={isPending}
                          >
                            Promote to live
                          </SmallBtn>
                        )}
                        {!isLive && (
                          <SmallBtn
                            $destructive
                            onClick={() => handleDelete(v)}
                            disabled={isPending}
                          >
                            Delete
                          </SmallBtn>
                        )}
                      </ActionRow>
                    </VersionCard>
                  );
                })
              )}
            </PanelBody>
          </Panel>
        </Overlay>
      )}
    </>
  );
}
