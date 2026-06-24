"use client";

import styled from "styled-components";
import type { ResolvedDocItem } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import ContributorByline from "./ContributorByline";
import PoliticsCompare from "./PoliticsCompare";
import AudioPlayer from "@/components/ui/AudioPlayer";
import AdminItemList from "@/components/admin/AdminItemList";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import type { DocItem } from "@/lib/types/content";

interface Props {
  date: string;
  musicItems: ResolvedDocItem[];
  theatreItems: ResolvedDocItem[];
  politicsDebatsItems: ResolvedDocItem[];
  politicsGalignaniItems: ResolvedDocItem[];
  annonceItems: ResolvedDocItem[];
  contributors: Map<string, ContributorInfo>;
  // Raw DocItem arrays for admin add/edit/delete/reorder
  rawMusicItems: DocItem[];
  rawTheatreItems: DocItem[];
  rawLiteratureItems: DocItem[];
  rawGalignaniItems: DocItem[];
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Sidebar = styled.aside`
  background: var(--paper-card);
  border-left: 1px solid var(--rule-mid);
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
`;

const SectionHeading = styled.h3`
  font-family: var(--font-display-stack);
  font-style: italic;
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--gilt-warm);
  margin: 0 0 14px;
`;

const Card = styled.div`
  border: 1px solid var(--rule-light);
  background: var(--paper-base);
  padding: 12px;
`;

const CardLabel = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 8px;
`;

const CardSubtitle = styled.div`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-muted);
  line-height: 1.4;
`;

const EmptyCard = styled.div`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--rule-mid);
  padding: 12px;
  border: 1px dashed var(--rule-light);
  text-align: center;
`;

// Theatre card
const PlaybillStrip = styled.div`
  height: 40px;
  background: repeating-linear-gradient(
    90deg,
    var(--paper-feature) 0 60px,
    var(--paper-deep) 60px 62px
  );
  border: 1px solid var(--rule-light);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-family: var(--font-display-stack);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-muted);
  overflow: hidden;
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstTextSnippet(items: ResolvedDocItem[], maxChars = 120): string | null {
  const t = items.find((i) => i.kind === "text");
  if (!t || t.kind !== "text") return null;
  return t.text.slice(0, maxChars).trim() + (t.text.length > maxChars ? "…" : "");
}

function firstAudio(items: ResolvedDocItem[]) {
  return items.find((i) => i.kind === "audio") ?? null;
}

function firstContributor(items: ResolvedDocItem[], contributors: Map<string, ContributorInfo>) {
  for (const item of items) {
    if (item.kind === "text" && item.contributor_id) {
      return contributors.get(item.contributor_id) ?? null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ParisSidebar({
  date,
  musicItems,
  theatreItems,
  politicsDebatsItems,
  politicsGalignaniItems,
  annonceItems,
  contributors,
  rawMusicItems,
  rawTheatreItems,
  rawLiteratureItems,
  rawGalignaniItems,
}: Props) {
  const { adminMode } = useAdminMode();

  const audioItem = firstAudio(musicItems);
  const theatreText = firstTextSnippet(theatreItems);
  const annonceText = firstTextSnippet(annonceItems, 80);
  const theatreContributor = firstContributor(theatreItems, contributors);

  return (
    <Sidebar>
      <SectionHeading>Paris, that day</SectionHeading>

      {/* Music — uses AudioPlayer for playback */}
      <Card>
        <CardLabel>♪ Music</CardLabel>
        {adminMode ? (
          <AdminItemList
            date={date}
            section="debats.music"
            rawItems={rawMusicItems}
            resolvedItems={musicItems}
            contributors={contributors}
            emptyMessage={<EmptyCard>Music content forthcoming</EmptyCard>}
          />
        ) : audioItem && audioItem.kind === "audio" ? (
          <AudioPlayer
            track={{
              url: audioItem.url,
              work_title: audioItem.work_title,
              composer: audioItem.composer,
              audio_license: audioItem.audio_license,
            }}
            compact
          />
        ) : firstTextSnippet(musicItems) ? (
          <CardSubtitle>{firstTextSnippet(musicItems)}</CardSubtitle>
        ) : (
          <EmptyCard>Music content forthcoming</EmptyCard>
        )}
      </Card>

      {/* Theatre */}
      <Card>
        <CardLabel>Theatre</CardLabel>
        {adminMode ? (
          <AdminItemList
            date={date}
            section="debats.theater"
            rawItems={rawTheatreItems}
            resolvedItems={theatreItems}
            contributors={contributors}
            emptyMessage={<EmptyCard>Theatre coverage forthcoming</EmptyCard>}
          />
        ) : theatreText ? (
          <>
            <PlaybillStrip>Théâtre de l&apos;Opéra</PlaybillStrip>
            <CardSubtitle>{theatreText}</CardSubtitle>
            {theatreContributor && (
              <div style={{ marginTop: 6 }}>
                <ContributorByline contributor={theatreContributor} prefix="Review by" />
              </div>
            )}
          </>
        ) : (
          <EmptyCard>Theatre coverage forthcoming</EmptyCard>
        )}
      </Card>

      {/* Politics compare */}
      <Card>
        <CardLabel>Politics</CardLabel>
        {adminMode ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <CardLabel style={{ marginBottom: 4 }}>Débats</CardLabel>
              <AdminItemList
                date={date}
                section="debats.literature"
                rawItems={rawLiteratureItems}
                resolvedItems={politicsDebatsItems}
                contributors={contributors}
                emptyMessage={<EmptyCard style={{ fontSize: 10 }}>No Débats politics items</EmptyCard>}
              />
            </div>
            <div>
              <CardLabel style={{ marginBottom: 4 }}>Galignani</CardLabel>
              <AdminItemList
                date={date}
                section="galignani"
                rawItems={rawGalignaniItems}
                resolvedItems={politicsGalignaniItems}
                contributors={contributors}
                emptyMessage={<EmptyCard style={{ fontSize: 10 }}>No Galignani politics items</EmptyCard>}
              />
            </div>
          </>
        ) : (
          <PoliticsCompare
            debatsItems={politicsDebatsItems}
            galignaniItems={politicsGalignaniItems}
          />
        )}
      </Card>

      {/* Annonce */}
      <Card>
        <CardLabel>Annonce</CardLabel>
        {annonceText ? (
          <CardSubtitle>{annonceText}</CardSubtitle>
        ) : (
          <EmptyCard>No announcements</EmptyCard>
        )}
      </Card>
    </Sidebar>
  );
}
