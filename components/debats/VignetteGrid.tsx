"use client";

/**
 * components/debats/VignetteGrid.tsx
 *
 * Framed portrait cards for Débats contributors.
 * Each card links to /people/[slug].
 * - Framer Motion hover lift.
 */

import React from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import BeatBadge from "@/components/people/BeatBadge";

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

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 1.25rem;
`;

const CardLink = styled(Link)`
  text-decoration: none;
  display: flex;
  height: 100%;
`;

const Frame = styled(motion.div)`
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--paper-card);
  border: 1px solid var(--rule-light);
  box-shadow: 0 1px 6px rgba(0,0,0,0.08);
  cursor: pointer;
`;

const ImgBox = styled.div`
  position: relative;
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: var(--paper-deep);
`;

const PortraitBeatBadge = styled(BeatBadge)`
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
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

// Tall enough for a three-line name (e.g. Alfred-Auguste Cuvillier-Fleury) plus dates.
const CARD_FOOTER_HEIGHT = "4rem";

const CardFooter = styled.div`
  flex-shrink: 0;
  height: ${CARD_FOOTER_HEIGHT};
  padding: 0.5rem 0.6rem;
  border-top: 1px solid var(--rule-light);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
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

const frameVariants = {
  rest: { y: 0, boxShadow: "0 1px 6px rgba(0,0,0,0.08)" },
  hover: { y: -4, boxShadow: "0 6px 24px rgba(0,0,0,0.15)" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VignetteGrid({ people }: VignetteGridProps) {
  return (
    <div>
      <Grid>
        <AnimatePresence initial={false}>
          {people.map((person) => (
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
                  {person.beat && <PortraitBeatBadge beat={person.beat} />}
                </ImgBox>

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
