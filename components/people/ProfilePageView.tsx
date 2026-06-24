"use client";

/**
 * components/people/ProfilePageView.tsx
 *
 * Client shell for the profile page — assembles the masthead, life timeline
 * header, and 7-tab ProfileTabs component.
 */

import React, { Suspense } from "react";
import styled from "styled-components";
import Link from "next/link";
import type { PersonPageData } from "@/lib/people";
import type { PortraitAsset } from "./PortraitGallery";
import type { GraphPerson, GraphRelationship } from "@/lib/graph-layout";
import ProfileTabs from "./ProfileTabs";

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

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0 16px;
  border-bottom: 1px solid var(--rule-light);
  margin-bottom: 2rem;
`;

const BackLink = styled(Link)`
  font-family: var(--font-labels-stack);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  text-decoration: none;
  &:hover { color: var(--gilt-deep); }
`;

const DebatsLink = styled(Link)`
  font-family: var(--font-labels-stack);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  text-decoration: none;
  &:hover { color: var(--gilt-deep); }
`;

const Header = styled.header`
  display: flex;
  gap: 2rem;
  align-items: flex-start;
  margin-bottom: 2rem;

  @media (max-width: 600px) { flex-direction: column; gap: 1rem; }
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

const ContributorBadge = styled(MetaBadge)`
  border-color: var(--gilt-warm);
  color: var(--gilt-deep);
  background: rgba(201,162,75,0.08);
`;

const Dates = styled.p`
  margin: 0;
  font-family: var(--font-labels-stack);
  font-size: 0.8rem;
  color: var(--ink-muted);
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfilePageView({
  person,
  portraitAssets,
  egoGraph,
}: ProfilePageViewProps) {
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
  const headerPortraitUrl =
    portraitAssets.find((a) => a.kind === "portrait")?.r2_url ??
    portraitAssets.find((a) => a.kind === "portrait")?.source_url ??
    person.portrait_url;

  return (
    <Page>
      <TopBar>
        <BackLink href="/timeline">← Timeline</BackLink>
        <DebatsLink href="/debats">Journal des Débats →</DebatsLink>
      </TopBar>

      <Header>
        {headerPortraitUrl ? (
          <PortraitThumb
            src={headerPortraitUrl}
            alt={`Portrait of ${person.name}`}
          />
        ) : (
          <PortraitPlaceholder aria-hidden="true">☽</PortraitPlaceholder>
        )}

        <HeaderText>
          <Name>{person.name}</Name>
          <Meta>
            {person.is_contributor && <ContributorBadge>✦ Débats Contributor</ContributorBadge>}
            {person.beat && <MetaBadge>{person.beat}</MetaBadge>}
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
    </Page>
  );
}
