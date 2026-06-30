"use client";

import { useState } from "react";
import styled from "styled-components";
import type { ResolvedTextItem } from "@/lib/content";
import { pickProseRenderer, renderProseParagraphs } from "@/lib/render-prose";
import { usePeopleLinkPlain } from "@/lib/people-linker";

interface Props {
  item: ResolvedTextItem;
  /** Page scan image URL (the matching original_pages entry), or null. */
  scanUrl: string | null;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) 1.4fr;
  gap: 28px;
  align-items: start;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    gap: 18px;
  }
`;

const ScanColumn = styled.div`
  position: sticky;
  top: 16px;

  @media (max-width: 720px) {
    position: static;
  }
`;

const ScanFrame = styled.div`
  position: relative;
  line-height: 0;
  border: 1px solid var(--rule-mid);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
`;

const ScanImg = styled.img`
  width: 100%;
  height: auto;
  display: block;
`;

const RegionBox = styled.div<{ $active: boolean }>`
  position: absolute;
  cursor: pointer;
  border: 1px solid
    ${({ $active }) => ($active ? "var(--oxblood)" : "transparent")};
  background: ${({ $active }) =>
    $active ? "rgba(122, 30, 30, 0.18)" : "transparent"};
  transition: background 0.12s, border-color 0.12s;

  &:hover {
    border-color: var(--oxblood);
    background: rgba(122, 30, 30, 0.1);
  }
`;

const ScanHint = styled.p`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
  margin: 6px 0 0;
`;

const ProseColumn = styled.div``;

const Section = styled.div<{ $active: boolean }>`
  padding: 4px 10px;
  margin: 0 -10px;
  border-left: 2px solid
    ${({ $active }) => ($active ? "var(--oxblood)" : "transparent")};
  background: ${({ $active }) =>
    $active ? "rgba(122, 30, 30, 0.06)" : "transparent"};
  border-radius: 2px;
  transition: background 0.12s, border-color 0.12s;

  p {
    margin: 0 0 0.9em;
  }
  p:last-child {
    margin-bottom: 0;
  }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Side-by-side view of a translated newspaper page: the source scan with
 * hoverable region boxes, and the English split into its reading-order
 * sections. Hovering a section highlights its region on the scan and vice
 * versa, so a reader can locate any passage on the original page.
 */
export default function SectionedPaperPage({ item, scanUrl }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const sections = item.sections ?? [];
  const linkPlain = usePeopleLinkPlain();
  const renderInline = pickProseRenderer(item.translation_origin, linkPlain);

  return (
    <Layout>
      <ScanColumn>
        {scanUrl ? (
          <>
            <ScanFrame>
              <ScanImg src={scanUrl} alt="Original newspaper page scan" />
              {sections.map((s, i) => (
                <RegionBox
                  key={i}
                  $active={active === i}
                  style={{
                    left: `${s.region.x}%`,
                    top: `${s.region.y}%`,
                    width: `${s.region.w}%`,
                    height: `${s.region.h}%`,
                  }}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  aria-label={`Column ${i + 1} on the page`}
                />
              ))}
            </ScanFrame>
            <ScanHint>Hover a column to match it with the translation.</ScanHint>
          </>
        ) : (
          <ScanHint>No page scan available.</ScanHint>
        )}
      </ScanColumn>

      <ProseColumn>
        {sections.map((s, i) => (
          <Section
            key={i}
            $active={active === i}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
          >
            {renderProseParagraphs(
              item.text.slice(s.start, s.end),
              renderInline,
            )}
          </Section>
        ))}
      </ProseColumn>
    </Layout>
  );
}
