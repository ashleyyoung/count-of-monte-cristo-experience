"use client";

/**
 * components/people/ProfilePageView.tsx
 *
 * Client shell for the profile page — assembles the masthead, life timeline
 * header, and 7-tab ProfileTabs component.
 */

import React, { Suspense, useRef, useState } from "react";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import BreadcrumbBar from "@/components/ui/BreadcrumbBar";
import type { PersonPageData } from "@/lib/people";
import type { PortraitAsset } from "./PortraitGallery";
import type { GraphPerson, GraphRelationship } from "@/lib/graph-layout";
import ProfileTabs from "./ProfileTabs";
import BeatBadge from "./BeatBadge";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import { uploadMediaToR2, setPersonImage } from "@/app/actions/admin";

interface ProfilePageViewProps {
  person: PersonPageData;
  portraitAssets: PortraitAsset[];
  egoGraph: { people: GraphPerson[]; relationships: GraphRelationship[] } | null;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Page = styled.div`
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 32px 64px;

  @media (max-width: 700px) { padding: 0 16px 40px; }
`;

const BackgroundBanner = styled.div<{ $url: string }>`
  position: relative;
  height: 260px;
  margin: 0 -32px 0;
  background-image:
    linear-gradient(180deg, rgba(30,20,10,0.15) 0%, var(--paper-base) 96%),
    url(${(p) => p.$url});
  background-size: cover;
  background-position: center 30%;

  @media (max-width: 700px) { height: 180px; margin: 0 -16px 0; }
`;

const BannerAttribution = styled.span`
  position: absolute;
  right: 12px;
  bottom: 10px;
  font-family: ui-monospace, monospace;
  font-size: 0.66rem;
  color: var(--ink-secondary);
  background: var(--paper-feature);
  padding: 3px 7px;
  opacity: 0.92;
`;

const TopBar = styled.div`
  padding: 20px 0 16px;
  border-bottom: 1px solid var(--rule-light);
  margin-bottom: 2rem;
`;

const Header = styled.header`
  display: flex;
  gap: 2rem;
  align-items: flex-start;
  margin-bottom: 2rem;

  @media (max-width: 600px) { flex-direction: column; gap: 1rem; }
`;

const PortraitFrame = styled.div`
  position: relative;
  flex-shrink: 0;
  width: fit-content;
`;

const PortraitBeatBadge = styled(BeatBadge)`
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
`;

const PortraitThumb = styled.img`
  width: 120px;
  height: 152px;
  object-fit: cover;
  border: 1px solid var(--rule-light);
  flex-shrink: 0;

  @media (max-width: 600px) { width: 80px; height: 100px; }
`;

const PortraitPlaceholder = styled.div`
  width: 120px;
  height: 152px;
  background: var(--paper-deep);
  border: 1px solid var(--rule-light);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--ink-muted);
  font-size: 2rem;
`;

const PortraitEdit = styled.button`
  position: relative;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  flex-shrink: 0;
  display: block;

  &:hover .portrait-overlay,
  &:focus-visible .portrait-overlay {
    opacity: 1;
  }
`;

const PortraitOverlay = styled.span`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0 8px;
  background: rgba(15, 8, 0, 0.55);
  color: var(--paper-base);
  font-family: var(--font-labels-stack);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  line-height: 1.4;
  opacity: 0;
  transition: opacity 0.12s;
  pointer-events: none;
`;

const HiddenFileInput = styled.input`
  display: none;
`;

const HeaderText = styled.div`
  flex: 1;
`;

const Name = styled.h1`
  margin: 0 0 0.3rem;
  font-family: var(--font-display-stack);
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  color: var(--ink-primary);
  font-weight: 400;
  line-height: 1.15;
`;

const Meta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-bottom: 0.75rem;
`;

const MetaBadge = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  border: 1px solid var(--rule-light);
  padding: 0.15rem 0.5rem;
`;

const Dates = styled.p`
  margin: 0;
  font-family: var(--font-labels-stack);
  font-size: 0.8rem;
  color: var(--ink-muted);
`;

const PortraitView = styled.button`
  display: block;
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
  flex-shrink: 0;
`;

// Lightbox — mirrors PortraitGallery's lightbox so the caption matches what
// the same image shows on the Portraits tab.
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a File to a base64 string (no data: prefix) via browser FileReader. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfilePageView({
  person,
  portraitAssets,
  egoGraph,
}: ProfilePageViewProps) {
  const router = useRouter();
  const { adminMode } = useAdminMode();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showPortraitLightbox, setShowPortraitLightbox] = useState(false);

  async function handlePortraitFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const { id } = await uploadMediaToR2(file.name, base64, file.type, "portrait");
      await setPersonImage(person.id, person.slug, "portrait", id);
      router.refresh();
    } catch (err) {
      alert(`Portrait upload failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }
  // Build lookup maps for relationship rendering
  const neighborSlugs: Record<string, string> = {};
  const neighborNames: Record<string, string> = {};
  if (egoGraph) {
    for (const p of egoGraph.people) {
      neighborSlugs[p.id] = p.slug;
      neighborNames[p.id] = p.name;
    }
  }

  // Portrait for header (first asset or from person data)
  const headerPortraitAsset = portraitAssets.find((a) => a.kind === "portrait");
  const headerPortraitUrl =
    headerPortraitAsset?.r2_url ??
    headerPortraitAsset?.source_url ??
    person.portrait_url;
  const headerPortraitTitle = headerPortraitAsset?.title ?? null;
  const headerPortraitAttribution =
    headerPortraitAsset?.attribution ?? person.portrait_attribution ?? null;

  const portraitContent = adminMode ? (
    <PortraitEdit
      type="button"
      onClick={() => fileInputRef.current?.click()}
      aria-label="Upload portrait image"
      disabled={uploading}
    >
      {headerPortraitUrl ? (
        <PortraitThumb src={headerPortraitUrl} alt={`Portrait of ${person.name}`} />
      ) : (
        <PortraitPlaceholder aria-hidden="true">☽</PortraitPlaceholder>
      )}
      <PortraitOverlay className="portrait-overlay">
        {uploading ? "Uploading…" : "⬆ Change portrait"}
      </PortraitOverlay>
      <HiddenFileInput
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handlePortraitFile}
        disabled={uploading}
      />
    </PortraitEdit>
  ) : headerPortraitUrl ? (
    <PortraitView
      type="button"
      onClick={() => setShowPortraitLightbox(true)}
      aria-label={`View larger portrait of ${person.name}`}
    >
      <PortraitThumb
        src={headerPortraitUrl}
        alt={`Portrait of ${person.name}`}
      />
    </PortraitView>
  ) : (
    <PortraitPlaceholder aria-hidden="true">☽</PortraitPlaceholder>
  );

  return (
    <Page>
      {person.background_url && (
        <BackgroundBanner $url={person.background_url}>
          {person.background_attribution && (
            <BannerAttribution>{person.background_attribution}</BannerAttribution>
          )}
        </BackgroundBanner>
      )}
      <TopBar>
        <BreadcrumbBar
          crumbs={[
            { label: "Journal des Débats", href: "/" },
            { label: "People & Lives", href: "/debats?tab=people" },
            { label: person.name },
          ]}
        />
      </TopBar>

      <Header>
        <PortraitFrame>
          {portraitContent}
          {person.beat && <PortraitBeatBadge beat={person.beat} />}
        </PortraitFrame>

        <HeaderText>
          <Name>{person.name}</Name>
          <Meta>
            <MetaBadge>{person.category}</MetaBadge>
          </Meta>
          <Dates>
            {person.birth ?? "?"}–{person.death ?? "present"}
          </Dates>
        </HeaderText>
      </Header>

      <Suspense fallback={null}>
        <ProfileTabs
          person={person}
          portraitAssets={portraitAssets}
          egoGraph={egoGraph}
          neighborSlugs={neighborSlugs}
          neighborNames={neighborNames}
        />
      </Suspense>

      <AnimatePresence>
        {showPortraitLightbox && headerPortraitUrl && (
          <Backdrop
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPortraitLightbox(false)}
            role="dialog"
            aria-label="Portrait lightbox"
            aria-modal="true"
          >
            <LightboxImg
              src={headerPortraitUrl}
              alt={headerPortraitTitle ?? `Portrait of ${person.name}`}
            />
            {(headerPortraitAttribution || headerPortraitTitle) && (
              <LightboxCaption>
                {headerPortraitTitle && <strong>{headerPortraitTitle}</strong>}
                {headerPortraitAttribution && ` · ${headerPortraitAttribution}`}
              </LightboxCaption>
            )}
          </Backdrop>
        )}
      </AnimatePresence>
    </Page>
  );
}
