"use client";

/**
 * components/people/PortraitGallery.tsx
 *
 * Displays portrait and caricature assets for a person, each with an
 * attribution chip and outbound source link.
 */

import React, { useState } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";

export interface PortraitAsset {
  id: string;
  r2_url: string | null;
  source_url: string | null;
  title: string | null;
  attribution: string | null;
  license: string | null;
  kind: "portrait" | "caricature" | string;
}

interface PortraitGalleryProps {
  assets: PortraitAsset[];
  name: string;
}

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 1.25rem;
`;

const Card = styled.div`
  display: flex;
  flex-direction: column;
  border: 1px solid var(--rule-light);
  background: var(--paper-card);
`;

const ImgWrap = styled.div`
  aspect-ratio: 3 / 4;
  overflow: hidden;
  background: var(--paper-deep);
  cursor: zoom-in;
`;

const Img = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.2s ease;

  ${ImgWrap}:hover & {
    transform: scale(1.04);
  }
`;

const Caption = styled.div`
  padding: 0.5rem 0.6rem;
  border-top: 1px solid var(--rule-light);
`;

const KindBadge = styled.span`
  display: inline-block;
  font-size: 0.6rem;
  font-family: var(--font-labels-stack);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  margin-bottom: 0.2rem;
`;

const Attribution = styled.p`
  margin: 0;
  font-size: 0.72rem;
  font-family: var(--font-script-stack);
  color: var(--ink-muted);
  line-height: 1.35;
`;

const SourceA = styled.a`
  font-size: 0.64rem;
  font-family: var(--font-labels-stack);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gilt-deep);
  text-decoration: none;
  border-bottom: 1px dotted var(--gilt-deep);
  &:hover { color: var(--oxblood); border-bottom-color: var(--oxblood); }
`;

// Lightbox
const Backdrop = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(15, 8, 0, 0.82);
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
`;

const LightboxImg = styled.img`
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  box-shadow: 0 8px 40px rgba(0,0,0,0.5);
`;

const LightboxCaption = styled.div`
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15,8,0,0.75);
  color: var(--paper-base);
  padding: 0.4rem 0.8rem;
  font-size: 0.75rem;
  font-family: var(--font-labels-stack);
  text-align: center;
  max-width: 80vw;
`;

const Empty = styled.p`
  color: var(--ink-muted);
  font-style: italic;
  font-size: 0.875rem;
`;

export default function PortraitGallery({ assets, name }: PortraitGalleryProps) {
  const [lightbox, setLightbox] = useState<PortraitAsset | null>(null);

  if (assets.length === 0) {
    return <Empty>No portraits available yet for {name}.</Empty>;
  }

  return (
    <>
      <Grid>
        {assets.map((asset) => {
          const src = asset.r2_url ?? asset.source_url;
          if (!src) return null;
          return (
            <Card key={asset.id}>
              <ImgWrap onClick={() => setLightbox(asset)} role="button" tabIndex={0}
                aria-label={`View ${asset.title ?? name} portrait`}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setLightbox(asset); }}>
                <Img src={src} alt={asset.title ?? `Portrait of ${name}`} loading="lazy" />
              </ImgWrap>
              <Caption>
                <KindBadge>{asset.kind}</KindBadge>
                {asset.attribution && <Attribution>{asset.attribution}</Attribution>}
                {(asset.source_url || asset.license) && (
                  <div style={{ marginTop: "0.25rem" }}>
                    {asset.source_url && (
                      <SourceA href={asset.source_url} target="_blank" rel="noopener noreferrer">
                        Source ↗
                      </SourceA>
                    )}
                    {asset.license && (
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.6rem", color: "var(--ink-muted)" }}>
                        {asset.license}
                      </span>
                    )}
                  </div>
                )}
              </Caption>
            </Card>
          );
        })}
      </Grid>

      <AnimatePresence>
        {lightbox && (
          <Backdrop
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            role="dialog"
            aria-label="Portrait lightbox"
            aria-modal="true"
          >
            <LightboxImg
              src={lightbox.r2_url ?? lightbox.source_url ?? ""}
              alt={lightbox.title ?? `Portrait of ${name}`}
            />
            {(lightbox.attribution || lightbox.title) && (
              <LightboxCaption>
                {lightbox.title && <strong>{lightbox.title}</strong>}
                {lightbox.attribution && ` · ${lightbox.attribution}`}
              </LightboxCaption>
            )}
          </Backdrop>
        )}
      </AnimatePresence>
    </>
  );
}
