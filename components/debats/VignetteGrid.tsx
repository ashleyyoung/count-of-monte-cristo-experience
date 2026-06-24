"use client";

/**
 * components/debats/VignetteGrid.tsx
 *
 * Framed portrait cards for all people (contributors + famous connections).
 * - Each card links to /people/[slug] or opens a detail popover for non-profiled figures.
 * - Contributors carry a gold star badge (is_contributor).
 * - Filter toggle: "contributors only" vs "everyone".
 * - Framer Motion hover lift.
 */

import React, { useState } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VignettePerson {
  id: string;
  slug: string;
  name: string;
  is_contributor: boolean;
  category: string;
  beat: string | null;
  birth: number | null;
  death: number | null;
  portrait_url: string | null;
}

interface VignetteGridProps {
  people: VignettePerson[];
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const FilterBtn = styled.button<{ $active: boolean }>`
  font-family: var(--font-labels-stack);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.35rem 0.9rem;
  border: 1px solid ${({ $active }) => ($active ? "var(--gilt-warm)" : "var(--rule-mid)")};
  background: ${({ $active }) => ($active ? "rgba(201,162,75,0.1)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--gilt-deep)" : "var(--ink-muted)")};
  cursor: pointer;
  transition: all 0.12s;

  &:hover { border-color: var(--gilt-warm); color: var(--gilt-deep); }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 1.25rem;
`;

const CardLink = styled(Link)`
  text-decoration: none;
  display: block;
`;

const Frame = styled(motion.div)`
  position: relative;
  background: var(--paper-card);
  border: 1px solid var(--rule-light);
  box-shadow: 0 1px 6px rgba(0,0,0,0.08);
  cursor: pointer;
`;

const ImgBox = styled.div`
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: var(--paper-deep);
`;

const PortraitImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
`;

const PlaceholderImg = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  color: var(--rule-strong);
`;

const CardFooter = styled.div`
  padding: 0.5rem 0.6rem;
  border-top: 1px solid var(--rule-light);
`;

const CardName = styled.p`
  margin: 0;
  font-family: var(--font-body-stack);
  font-size: 0.78rem;
  color: var(--ink-primary);
  line-height: 1.3;
`;

const CardMeta = styled.p`
  margin: 0.15rem 0 0;
  font-family: var(--font-labels-stack);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-muted);
`;

const StarBadge = styled.span`
  position: absolute;
  top: 6px;
  right: 6px;
  background: var(--gilt-warm);
  color: var(--paper-base);
  font-size: 0.65rem;
  padding: 0.1rem 0.35rem;
  border-radius: 2px;
  font-family: var(--font-labels-stack);
  letter-spacing: 0.04em;
`;

const KindPlacard = styled.div`
  position: absolute;
  bottom: 44px;
  left: 0;
  right: 0;
  text-align: center;
  pointer-events: none;
`;

const KindSpan = styled.span`
  display: inline-block;
  background: rgba(15,8,0,0.55);
  color: var(--paper-base);
  font-family: var(--font-labels-stack);
  font-size: 0.55rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0.1rem 0.4rem;
`;

const frameVariants = {
  rest: { y: 0, boxShadow: "0 1px 6px rgba(0,0,0,0.08)" },
  hover: { y: -4, boxShadow: "0 6px 24px rgba(0,0,0,0.15)" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VignetteGrid({ people }: VignetteGridProps) {
  const [contributorsOnly, setContributorsOnly] = useState(false);

  const visible = contributorsOnly
    ? people.filter((p) => p.is_contributor)
    : people;

  return (
    <div>
      <Controls>
        <FilterBtn $active={!contributorsOnly} onClick={() => setContributorsOnly(false)}>
          Everyone ({people.length})
        </FilterBtn>
        <FilterBtn $active={contributorsOnly} onClick={() => setContributorsOnly(true)}>
          ✦ Débats contributors ({people.filter((p) => p.is_contributor).length})
        </FilterBtn>
      </Controls>

      <Grid>
        <AnimatePresence initial={false}>
          {visible.map((person) => (
            <CardLink key={person.id} href={`/people/${person.slug}`} aria-label={person.name}>
              <Frame
                layout
                variants={frameVariants}
                initial="rest"
                whileHover="hover"
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <ImgBox>
                  {person.portrait_url ? (
                    <PortraitImg
                      src={person.portrait_url}
                      alt={`Portrait of ${person.name}`}
                      loading="lazy"
                    />
                  ) : (
                    <PlaceholderImg aria-hidden="true">☽</PlaceholderImg>
                  )}
                </ImgBox>

                {person.is_contributor && <StarBadge>✦ Débats</StarBadge>}

                {person.beat && (
                  <KindPlacard>
                    <KindSpan>{person.beat}</KindSpan>
                  </KindPlacard>
                )}

                <CardFooter>
                  <CardName>{person.name}</CardName>
                  <CardMeta>
                    {person.birth ?? "?"}{person.death ? `–${person.death}` : "–"}
                  </CardMeta>
                </CardFooter>
              </Frame>
            </CardLink>
          ))}
        </AnimatePresence>
      </Grid>
    </div>
  );
}
