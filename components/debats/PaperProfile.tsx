"use client";

/**
 * components/debats/PaperProfile.tsx
 *
 * Sourced history of the Journal des Débats.
 * Each section is wrapped with EditableText in admin mode.
 * Admin edits are persisted to editorial_blocks; the full read-from-DB
 * rendering path lands in Sprint 10. Until then, readers always see the
 * hardcoded content below.
 */

import { useState } from "react";
import styled from "styled-components";
import Cite, { type CiteSource } from "@/components/ui/Cite";
import PeopleLinked from "@/components/people/PeopleLinked";
import EditableText from "@/components/admin/primitives/EditableText";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import { upsertEditorialBlock } from "@/app/actions/admin";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Article = styled.article`
  max-width: 72ch;
`;

const Section = styled.section`
  margin-bottom: 2.5rem;
`;

const H2 = styled.h2`
  font-family: var(--font-display-stack);
  font-size: 1.4rem;
  color: var(--ink-primary);
  font-weight: 400;
  margin: 0 0 0.75rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--rule-light);
`;

const H3 = styled.h3`
  font-family: var(--font-display-stack);
  font-size: 1.05rem;
  color: var(--ink-secondary);
  font-weight: 400;
  margin: 1.5rem 0 0.4rem;
`;

const P = styled.p`
  font-family: var(--font-body-stack);
  font-size: 1rem;
  line-height: 1.7;
  color: var(--ink-primary);
  margin: 0 0 0.9rem;
`;

const Blockquote = styled.blockquote`
  margin: 1rem 0 1rem 1.5rem;
  padding-left: 1rem;
  border-left: 3px solid var(--gilt-warm);
  font-style: italic;
  color: var(--ink-secondary);
  font-family: var(--font-body-stack);
  font-size: 0.95rem;
  line-height: 1.6;
`;

const SourcesRow = styled.div`
  margin-top: 2rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--rule-light);
`;

const SourcesLabel = styled.p`
  font-family: var(--font-labels-stack);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ink-muted);
  margin: 0 0 0.4rem;
`;

const SourceList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 1rem;
`;

const SourceItem = styled.li`
  font-size: 0.72rem;
  font-family: var(--font-caption-stack);
`;

const SourceA = styled.a`
  color: var(--gilt-deep);
  text-decoration: none;
  border-bottom: 1px dotted var(--gilt-deep);
  &:hover { color: var(--oxblood); }
`;

const MastheadPlaceholder = styled.div`
  width: 100%;
  max-width: 560px;
  min-height: 80px;
  border: 1px solid var(--rule-light);
  background: var(--paper-deep);
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 1.25rem 1.5rem;
  font-family: var(--font-masthead-stack);
  font-size: 1.4rem;
  color: var(--ink-primary);
  letter-spacing: 0.04em;
  margin-bottom: 1.5rem;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Static fallback text for each section (used as initial value for admin editing)
const SECTION_TEXT: Record<string, string> = {
  "paper-profile-founded": `The *Journal des Débats* was founded on 29 August 1789, just weeks after the fall of the Bastille, to publish the debates of the new National Assembly. Under the motto *Politiques et Littéraires* it soon expanded beyond parliamentary reporting to become the preeminent cultural and political newspaper of France.

By the July Monarchy (1830–48) it was read by every educated Parisian — politicians, artists, scientists, financiers — and its feuilleton section, printed in small type at the bottom of the front page, had become the most coveted literary real estate in France.`,
  "paper-profile-bertins": `Louis-François Bertin rescued the paper from revolutionary chaos, refounded it in 1800 under Napoleon, and steered it through Empire and Restoration to Orléanist liberalism. His portrait by Ingres (1832, now in the Louvre) became the iconic image of bourgeois authority.

Armand Bertin (1801–1854) directed the paper from 1834 until his death. Under Armand the Débats reached the height of its prestige: Jules Janin's theatre column, Berlioz's music feuilletons, Delécluze's Salon criticism — and, from 28 August 1844, Alexandre Dumas's *Le Comte de Monte-Cristo*.`,
  "paper-profile-politics": `The Débats was an Orléanist paper — loyal to the constitutional monarchy of Louis-Philippe (r. 1830–48) and to the propertied bourgeoisie. Its liberalism was that of the *juste milieu*: free press, constitutional government, property rights, order.

In 1844 that alignment ran directly through Armand Bertin's editorial choices: which writers to champion, which composers to praise, which serials to publish.`,
  "paper-profile-feuilleton": `The bottom strip of the front page — the *feuilleton* (literally "little leaf") — was physically separated from the news above by a horizontal rule. It was the paper's entertainment zone: theatre reviews, music criticism, art notices, novels.

"The feuilleton was the great literary school of the nineteenth century: it taught writers to engage, to entertain, to hold their public across weeks and months."`,
  "paper-profile-cultural-role": `During the Monte Cristo serialization the Débats was not merely a newspaper: it was a cultural institution. A reader who followed the paper through the full serialization — 28 August 1844 to 15 January 1846, 139 installments — absorbed not only Dumas's novel but the full cultural life of Paris.`,
};

export default function PaperProfile() {
  const { adminMode } = useAdminMode();
  const router = useRouter();

  const cites: CiteSource[] = [
    {
      title: "Journal des Débats — complete archive",
      attribution: "Bibliothèque nationale de France (Gallica)",
      license: "Public Domain",
      source_text_url: "https://gallica.bnf.fr/services/engine/search/sru?operation=searchRetrieve&version=1.2&query=ark+all+%22Journal+des+d%C3%A9bats%22&suggest=0&keywords=journal+des+d%C3%A9bats",
    },
    {
      title: "Armand Bertin",
      attribution: "Wikipedia (fr)",
      license: "CC BY-SA",
      source_text_url: "https://fr.wikipedia.org/wiki/Armand_Bertin",
    },
    {
      title: "Journal des Débats — Gallica digital archive",
      attribution: "Bibliothèque nationale de France",
      license: "Public Domain",
      source_text_url: "https://gallica.bnf.fr/",
    },
  ];

  function makeSectionSave(key: string, title: string) {
    return async (newText: string) => {
      await upsertEditorialBlock(key, title, newText);
      router.refresh();
    };
  }

  return (
    <Article>
      <MastheadPlaceholder aria-label="Journal des Débats masthead">
        Journal des Débats Politiques et Littéraires
      </MastheadPlaceholder>

      <Section>
        <H2>Founded 1789</H2>
        <EditableText
          value={SECTION_TEXT["paper-profile-founded"]}
          onSave={makeSectionSave("paper-profile-founded", "Founded 1789")}
        >
          <PeopleLinked>
          <P>
            The <em>Journal des Débats</em> was founded on 29 August 1789, just weeks after the fall of the
            Bastille, to publish the debates of the new National Assembly. Under the motto{" "}
            <em>Politiques et Littéraires</em> it soon expanded beyond parliamentary reporting to become the
            preeminent cultural and political newspaper of France.
          </P>
          <P>
            By the July Monarchy (1830–48) it was read by every educated Parisian — politicians,
            artists, scientists, financiers — and its feuilleton section, printed in small type at the
            bottom of the front page, had become the most coveted literary real estate in France.<Cite source={cites[0]} n={1} />
          </P>
          </PeopleLinked>
        </EditableText>
      </Section>

      <Section>
        <H2>The Bertin Family</H2>
        <EditableText
          value={SECTION_TEXT["paper-profile-bertins"]}
          onSave={makeSectionSave("paper-profile-bertins", "The Bertin Family")}
        >
          <PeopleLinked>
          <H3>Louis-François Bertin (<em>l&apos;aîné</em>), 1766–1841</H3>
          <P>
            Louis-François Bertin rescued the paper from revolutionary chaos, refounded it in 1800 under
            Napoleon, and steered it through Empire and Restoration to Orléanist liberalism. His portrait by
            Ingres (1832, now in the Louvre) became the iconic image of bourgeois authority; his face stares
            out from the canvas with the implacable confidence of the self-made press lord.
          </P>
          <H3>Armand Bertin, 1801–1854</H3>
          <P>
            Armand, son of Louis-François, directed the paper from 1834 until his death in 1854. Under
            Armand the Débats reached the height of its prestige: Jules Janin&apos;s Monday theatre column, Hector
            Berlioz&apos;s music feuilletons, Étienne-Jean Delécluze&apos;s Salon criticism — and, from 28 August 1844,
            Alexandre Dumas&apos;s <em>Le Comte de Monte-Cristo</em>.
          </P>
          <P>
            Armand Bertin was also a patron of the arts; the Ingres portrait of his father hangs today in the
            Louvre as testament to the family&apos;s cultural ambitions.<Cite source={cites[1]} n={2} />
          </P>
          </PeopleLinked>
        </EditableText>
      </Section>

      <Section>
        <H2>Political Alignment</H2>
        <EditableText
          value={SECTION_TEXT["paper-profile-politics"]}
          onSave={makeSectionSave("paper-profile-politics", "Political Alignment")}
        >
          <PeopleLinked>
          <P>
            The Débats was a Orléanist paper — loyal to the constitutional monarchy of Louis-Philippe
            (r. 1830–48) and to the propertied bourgeoisie. It opposed Legitimism (the Bourbon claim),
            Bonapartism, and radical republicanism with equal consistency. Its liberalism was that of the
            <em>juste milieu</em>: free press, constitutional government, property rights, order.
          </P>
          <P>
            In 1844 that alignment ran directly through Armand Bertin&apos;s editorial choices: which writers
            to champion, which composers to praise, which serials to publish. Dumas&apos;s Monte Cristo — a story
            of injustice, revenge, and self-invention — fit the Débats&apos;s worldview with uncanny precision.
          </P>
          </PeopleLinked>
        </EditableText>
      </Section>

      <Section>
        <H2>The Feuilleton</H2>
        <EditableText
          value={SECTION_TEXT["paper-profile-feuilleton"]}
          onSave={makeSectionSave("paper-profile-feuilleton", "The Feuilleton")}
        >
          <PeopleLinked>
          <P>
            The bottom strip of the front page — the <em>feuilleton</em> (literally &quot;little leaf&quot;) — was
            physically separated from the news above by a horizontal rule. It was the paper&apos;s entertainment
            zone: theatre reviews, music criticism, art notices, novels. Dumas serialized three novels in the
            Débats feuilleton in the 1840s; Monte Cristo was the longest and most successful.
          </P>
          <Blockquote>
            &quot;The feuilleton was the great literary school of the nineteenth century: it taught
            writers to engage, to entertain, to hold their public across weeks and months.&quot;
            <br />
            — literary historian paraphrasing contemporaries (source: Gallica scholarship)
          </Blockquote>
          <P>
            The Débats archive preserves every issue of the paper from its founding through the
            serialization years.<Cite source={cites[2]} n={3} />
          </P>
          </PeopleLinked>
        </EditableText>
      </Section>

      <Section>
        <H2>Cultural Role, 1844–46</H2>
        <EditableText
          value={SECTION_TEXT["paper-profile-cultural-role"]}
          onSave={makeSectionSave("paper-profile-cultural-role", "Cultural Role 1844-46")}
        >
          <PeopleLinked>
          <P>
            During the Monte Cristo serialization the Débats was not merely a newspaper: it was a
            cultural institution. Its front page on any given morning in 1844 might carry:
          </P>
          <ul style={{ fontFamily: "var(--font-body-stack)", lineHeight: 1.7, paddingLeft: "1.5rem", marginBottom: "0.9rem" }}>
            <li>Parliamentary and foreign political dispatches</li>
            <li>Music criticism by Berlioz (operas, concerts, new scores)</li>
            <li>Theatre notices by Janin (Comédie-Française, Opéra, Opéra-Comique)</li>
            <li>Science notes from Donné and Foucault (Académie des sciences, new discoveries)</li>
            <li>Art-Salon reviews by Delécluze</li>
            <li>And, at the very bottom, the latest episode of Monte Cristo</li>
          </ul>
          <P>
            A reader who followed the paper through the full serialization — 28 August 1844 to 15 January 1846,
            139 installments — absorbed not only Dumas&apos;s novel but the full cultural life of Paris.
          </P>
          </PeopleLinked>
        </EditableText>
      </Section>

      <SourcesRow>
        <SourcesLabel>Sources for this page</SourcesLabel>
        <SourceList>
          {[
            { url: "https://gallica.bnf.fr/", label: "Gallica — Journal des Débats digital archive (BnF)" },
            { url: "https://fr.wikipedia.org/wiki/Journal_des_d%C3%A9bats", label: "Wikipedia (fr) — Journal des Débats (CC BY-SA)" },
            { url: "https://fr.wikipedia.org/wiki/Armand_Bertin", label: "Wikipedia (fr) — Armand Bertin (CC BY-SA)" },
            { url: "https://fr.wikipedia.org/wiki/Louis-Fran%C3%A7ois_Bertin", label: "Wikipedia (fr) — Louis-François Bertin (CC BY-SA)" },
            { url: "https://data.bnf.fr/fr/11891163/armand_bertin/", label: "data.bnf.fr — Armand Bertin" },
          ].map((s, i) => (
            <SourceItem key={i}>
              <SourceA href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label} ↗
              </SourceA>
            </SourceItem>
          ))}
        </SourceList>
      </SourcesRow>
    </Article>
  );
}
