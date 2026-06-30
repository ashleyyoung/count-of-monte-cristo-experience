"use client";

/**
 * components/debats/PressBusiness.tsx
 *
 * "The Business": the economics, politics, and writers of the Paris daily
 * press in the 1840s. Covers the cost to readers, the 1836 advertising
 * revolution, payment by the line, the stamp tax and security deposit,
 * news-gathering and the Havas agency, contributor coordination and lead
 * times, and the scandals around Dumas's serial fiction.
 *
 * Mirrors PaperProfile.tsx and PressRoom.tsx: styled prose primitives,
 * footnoted Cite markers, a sources footer, and EditableText admin overlay.
 */

import styled from "styled-components";
import { useRouter } from "next/navigation";
import Cite, { type CiteSource } from "@/components/ui/Cite";
import PeopleLinked from "@/components/people/PeopleLinked";
import EditableText from "@/components/admin/primitives/EditableText";
import { upsertEditorialBlock } from "@/app/actions/admin";

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Article = styled.article`
  max-width: 960px;
`;

const Section = styled.section`
  margin-bottom: 2.5rem;
`;

const TwoColSection = styled.section`
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 2.5rem;
  align-items: start;
  margin-bottom: 2.5rem;

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
  }
`;

const ProseWrap = styled.div`
  max-width: 65ch;
  min-width: 0;
`;

const Figure = styled.figure`
  margin: 0;
  border: 1px solid var(--rule-light);
  background: var(--paper-deep);
  padding: 8px;
`;

const FigImg = styled.img`
  width: 100%;
  height: auto;
  display: block;
  filter: sepia(0.15) contrast(1.05);
`;

const FigCaption = styled.figcaption`
  font-family: var(--font-caption-stack);
  font-size: 0.68rem;
  font-style: italic;
  color: var(--ink-muted);
  margin-top: 6px;
  line-height: 1.4;
`;

const FigAttr = styled.a`
  display: inline-block;
  margin-top: 4px;
  font-family: var(--font-labels-stack);
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gilt-deep);
  text-decoration: none;
  border-bottom: 1px dotted var(--gilt-deep);

  &:hover {
    color: var(--oxblood);
  }
`;

const Lede = styled.p`
  font-family: var(--font-body-stack);
  font-size: 1.05rem;
  line-height: 1.7;
  font-style: italic;
  color: var(--ink-secondary);
  margin: 0 0 1.5rem;
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
  &:hover {
    color: var(--oxblood);
  }
`;

// ---------------------------------------------------------------------------
// Static fallback text for admin editing
// ---------------------------------------------------------------------------

const SECTION_TEXT: Record<string, string> = {
  "press-business-cost": `A traditional Paris daily cost about 80 francs a year, more than a week of a skilled worker's wages, so the paper was a possession of the comfortable. The printed subscriber count understated the real audience, because a single copy passed through many hands in cafés and in the cabinets de lecture, the paid reading rooms. Most subscribers lived outside Paris: in 1846 Le Siècle counted 21,500 of its 32,800 subscribers in the provinces, and about two-thirds of the Débats readership lay outside the capital.`,
  "press-business-pricewar": `On 1 July 1836 two new dailies, Émile de Girardin's La Presse and Armand Dutacq's Le Siècle, launched at 40 francs a year, half the going rate. They made up the difference with advertising and used the serialized novel to pull in a mass readership. This is the commercial logic that turned a front-page feuilleton into valuable property and made a serial like Monte Cristo worth competing for.`,
  "press-business-line": `Serial novelists were paid by the printed line. The arrangement is widely credited with shaping the prose itself, rewarding short, quick exchanges of dialogue that filled lines cheaply and kept the reader moving down the column. It is a rare case where a payment scheme left a visible mark on a literary style.`,
  "press-business-tax": `The state shaped the press through its budget. A stamp duty, the timbre, fell on each sheet, and under the September Laws of 9 September 1835, passed after Fieschi's attempt on the life of Louis-Philippe, every political paper had to lodge a large security deposit, the cautionnement, scaled by how often it appeared: 100,000 francs for a paper published more than twice a week. The same laws placed drawings under prior authorization. These costs pressed hardest on cheap opposition titles and pushed the press toward the advertising-funded commercial model.`,
  "press-business-news": `News moved at the speed of the fastest available carrier. Before the electric telegraph reached France, reports traveled by stagecoach, by the Chappe optical semaphore, and increasingly by the new railways. In 1835 Charles-Louis Havas turned his Paris translation bureau into the Agence Havas, the world's first news agency and the ancestor of Agence France-Presse. Sited near the post office and the Bourse, it used carrier pigeons by 1840 to place same-day London and Brussels news into Paris papers. Two of its employees, Paul Reuter and Bernhard Wolff, went on to found the London and Berlin agencies.`,
  "press-business-writers": `Contributors filed on standing schedules. Jules Janin's theatre column appeared on Mondays, Berlioz's music feuilletons followed concerts and premieres, and Delécluze's reviews tracked the annual Salon. The serial was the tightest case of all. Alexandre Dumas worked with Auguste Maquet in a just-in-time system they called the botte de plans, the bundle of outlines: Maquet drafted plot, characters, and dialogue, and Dumas rewrote each installment in his own hand, often carrying several serials at once across rival papers. Dumas wrote at famous speed, once winning a wager by producing a 3,375-line volume in 66 hours. Monte Cristo ran in the Débats feuilleton from 28 August 1844 to 15 January 1846 with long interruptions, so copy often reached the compositors only a day or two before it was set.`,
  "press-business-scandal": `Success drew fire. In 1845, while Monte Cristo was still running, Eugène de Mirecourt published a pamphlet titled Fabrique de romans: Maison Alexandre Dumas et Cie, attacking Dumas's collaborative method as a novel factory; Dumas sued and won a judgment. At the same time, cheap counterfeit reprints from Belgium, the contrefaçon belge, circulated French novels across the border and cut into the income of authors and publishers alike.`,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PressBusiness() {
  const router = useRouter();

  const cites: CiteSource[] = [
    {
      title: "Le Siècle (journal)",
      attribution: "Wikipédia (fr)",
      license: "CC BY-SA",
      translation_source_url:
        "https://fr.wikipedia.org/wiki/Le_Si%C3%A8cle_(journal)",
    },
    {
      title: "La Presse (France)",
      attribution: "Wikipédia (fr)",
      license: "CC BY-SA",
      translation_source_url: "https://fr.wikipedia.org/wiki/La_Presse_(France)",
    },
    {
      title: "Loi sur la presse du 9 septembre 1835",
      attribution: "Wikipédia (fr) and Médias 19 (text of the law)",
      translation_source_url:
        "https://fr.wikipedia.org/wiki/Loi_sur_la_presse_du_9_septembre_1835",
    },
    {
      title: "Havas",
      attribution: "SAGE Encyclopedia of Journalism",
      translation_source_url:
        "https://sk.sagepub.com/ency/edvol/the-sage-encyclopedia-of-journalism-2e/chpt/havas",
    },
    {
      title: "Le Comte de Monte-Cristo en feuilleton",
      attribution: "Bibliothèque nationale de France (Gallica)",
      license: "Public Domain",
      translation_source_url:
        "https://gallica.bnf.fr/selections/fr/html/presse-et-revues/le-comte-de-monte-cristo-en-feuilleton",
    },
    {
      title: "Alexandre Dumas (père)",
      attribution: "Encyclopedia.com",
      translation_source_url:
        "https://www.encyclopedia.com/children/academic-and-educational-journals/alexandre-dumas-pere",
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
      <Lede>
        A newspaper is a business before it is a culture. The price of a
        subscription, the cost of paper and labor, the taxes the state levied,
        and the fees paid to writers all shaped what a reader in 1844 actually
        held each morning.
      </Lede>

      <Section>
        <ProseWrap>
          <H2>What It Cost the Reader</H2>
          <EditableText
            value={SECTION_TEXT["press-business-cost"]}
            onSave={makeSectionSave(
              "press-business-cost",
              "What It Cost the Reader",
            )}
          >
            <PeopleLinked>
            <P>
              A traditional Paris daily cost about 80 francs a year, more than a
              week of a skilled worker&apos;s wages, so the paper was a possession
              of the comfortable. The printed subscriber count understated the
              real audience, because a single copy passed through many hands in
              cafés and in the cabinets de lecture, the paid reading rooms.
            </P>
            <P>
              Most subscribers lived outside Paris. In 1846 Le Siècle counted
              21,500 of its 32,800 subscribers in the provinces, and about
              two-thirds of the Débats readership lay outside the capital.
              <Cite source={cites[0]} n={1} />
            </P>
          </PeopleLinked>
        </EditableText>
        </ProseWrap>
      </Section>

      <TwoColSection>
        <ProseWrap>
          <H2>The 1836 Price War</H2>
          <EditableText
            value={SECTION_TEXT["press-business-pricewar"]}
            onSave={makeSectionSave(
              "press-business-pricewar",
              "The 1836 Price War",
            )}
          >
            <PeopleLinked>
            <P>
              On 1 July 1836 two new dailies, Émile de Girardin&apos;s La Presse
              and Armand Dutacq&apos;s Le Siècle, launched at 40 francs a year,
              half the going rate. They made up the difference with advertising
              and used the serialized novel to pull in a mass readership.
              <Cite source={cites[1]} n={2} />
            </P>
            <P>
              This is the commercial logic that turned a front-page feuilleton
              into valuable property and made a serial like Monte Cristo worth
              competing for. The Débats, an established and upmarket paper, took
              up the same weapon when it secured Dumas.
            </P>
          </PeopleLinked>
        </EditableText>
        </ProseWrap>
        <Figure>
          <FigImg
            src="/api/gallica/iiif?ark=bpt6k446668c&page=1&size=500,"
            alt="Front page of the Journal des Débats, 28 August 1844, with the first Monte Cristo installment"
            loading="lazy"
          />
          <FigCaption>
            Journal des Débats, 28 August 1844: the first installment of Le Comte
            de Monte-Cristo appears at the foot of the front page.
          </FigCaption>
          <FigAttr
            href="https://gallica.bnf.fr/ark:/12148/bpt6k446668c"
            target="_blank"
            rel="noopener noreferrer"
          >
            Gallica (BnF) ↗
          </FigAttr>
        </Figure>
      </TwoColSection>

      <Section>
        <ProseWrap>
          <H2>Paid by the Line</H2>
        <EditableText
          value={SECTION_TEXT["press-business-line"]}
          onSave={makeSectionSave("press-business-line", "Paid by the Line")}
        >
          <PeopleLinked>
          <P>
            Serial novelists were paid by the printed line. The arrangement is
            widely credited with shaping the prose itself, rewarding short,
            quick exchanges of dialogue that filled lines cheaply and kept the
            reader moving down the column. It is a rare case where a payment
            scheme left a visible mark on a literary style.
          </P>
          </PeopleLinked>
        </EditableText>
        </ProseWrap>
      </Section>

      <Section>
        <ProseWrap>
          <H2>Taxed and Bonded</H2>
        <EditableText
          value={SECTION_TEXT["press-business-tax"]}
          onSave={makeSectionSave("press-business-tax", "Taxed and Bonded")}
        >
          <PeopleLinked>
          <P>
            The state shaped the press through its budget. A stamp duty, the
            timbre, fell on each sheet, and under the September Laws of 9
            September 1835, passed after Fieschi&apos;s attempt on the life of
            Louis-Philippe, every political paper had to lodge a large security
            deposit, the cautionnement, scaled by how often it appeared: 100,000
            francs for a paper published more than twice a week.
            <Cite source={cites[2]} n={3} />
          </P>
          <P>
            The same laws placed drawings and engravings under prior
            authorization. These costs pressed hardest on cheap opposition
            titles and pushed the whole press toward the advertising-funded
            commercial model that La Presse and Le Siècle had pioneered.
          </P>
          </PeopleLinked>
        </EditableText>
        </ProseWrap>
      </Section>

      <Section>
        <ProseWrap>
          <H2>How the News Arrived</H2>
        <EditableText
          value={SECTION_TEXT["press-business-news"]}
          onSave={makeSectionSave(
            "press-business-news",
            "How the News Arrived",
          )}
        >
          <PeopleLinked>
          <P>
            News moved at the speed of the fastest available carrier. Before the
            electric telegraph reached France, reports traveled by stagecoach,
            by the Chappe optical semaphore, and increasingly by the new
            railways.
          </P>
          <P>
            In 1835 Charles-Louis Havas turned his Paris translation bureau into
            the Agence Havas, the world&apos;s first news agency and the
            ancestor of Agence France-Presse. Sited near the post office and the
            Bourse, it used carrier pigeons by 1840 to place same-day London and
            Brussels news into Paris papers. Two of its employees, Paul Reuter
            and Bernhard Wolff, went on to found the London and Berlin agencies.
            <Cite source={cites[3]} n={4} />
          </P>
          </PeopleLinked>
        </EditableText>
        </ProseWrap>
      </Section>

      <TwoColSection>
        <ProseWrap>
          <H2>Coordinating the Writers</H2>
          <EditableText
            value={SECTION_TEXT["press-business-writers"]}
            onSave={makeSectionSave(
              "press-business-writers",
              "Coordinating the Writers",
            )}
          >
            <PeopleLinked>
            <P>
              Contributors filed on standing schedules. Jules Janin&apos;s theatre
              column appeared on Mondays, Berlioz&apos;s music feuilletons
              followed concerts and premieres, and Delécluze&apos;s reviews
              tracked the annual Salon.
            </P>
            <P>
              The serial was the tightest case of all. Alexandre Dumas worked with
              Auguste Maquet in a just-in-time system they called the botte de
              plans, the bundle of outlines: Maquet drafted plot, characters, and
              dialogue, and Dumas rewrote each installment in his own hand, often
              carrying several serials at once across rival papers. Dumas wrote at
              famous speed, once winning a wager by producing a 3,375-line volume
              in 66 hours.<Cite source={cites[5]} n={5} />
            </P>
            <P>
              Monte Cristo ran in the Débats feuilleton from 28 August 1844 to 15
              January 1846 with long interruptions, so copy often reached the
              compositors only a day or two before it was set.
              <Cite source={cites[4]} n={6} />
            </P>
          </PeopleLinked>
        </EditableText>
        </ProseWrap>
        <Figure>
          <FigImg
            src="https://upload.wikimedia.org/wikipedia/commons/5/54/Alexandre_Dumas_pere.jpg"
            alt="Portrait of Alexandre Dumas père"
            loading="lazy"
          />
          <FigCaption>
            Alexandre Dumas père, whose Monte Cristo ran in the Débats feuilleton
            from August 1844 to January 1846.
          </FigCaption>
          <FigAttr
            href="https://commons.wikimedia.org/wiki/File:Alexandre_Dumas_pere.jpg"
            target="_blank"
            rel="noopener noreferrer"
          >
            Wikimedia Commons ↗
          </FigAttr>
        </Figure>
      </TwoColSection>

      <Section>
        <ProseWrap>
          <H2>Scandal and Piracy</H2>
        <EditableText
          value={SECTION_TEXT["press-business-scandal"]}
          onSave={makeSectionSave(
            "press-business-scandal",
            "Scandal and Piracy",
          )}
        >
          <PeopleLinked>
          <P>
            Success drew fire. In 1845, while Monte Cristo was still running,
            Eugène de Mirecourt published a pamphlet titled Fabrique de romans:
            Maison Alexandre Dumas et Cie, attacking Dumas&apos;s collaborative
            method as a novel factory; Dumas sued and won a judgment.
          </P>
          <Blockquote>
            Cheap counterfeit reprints from Belgium, the contrefaçon belge,
            circulated French novels across the border and cut into the income
            of authors and publishers alike.
          </Blockquote>
          </PeopleLinked>
        </EditableText>
        </ProseWrap>
      </Section>

      <SourcesRow>
        <SourcesLabel>Sources for this page</SourcesLabel>
        <SourceList>
          {[
            {
              url: "https://fr.wikipedia.org/wiki/Le_Si%C3%A8cle_(journal)",
              label: "Wikipédia (fr) — Le Siècle (CC BY-SA)",
            },
            {
              url: "https://fr.wikipedia.org/wiki/La_Presse_(France)",
              label: "Wikipédia (fr) — La Presse (CC BY-SA)",
            },
            {
              url: "https://www.historyofinformation.com/detail.php?id=5586",
              label: "History of Information — Girardin launches La Presse (1836)",
            },
            {
              url: "https://fr.wikipedia.org/wiki/Loi_sur_la_presse_du_9_septembre_1835",
              label: "Wikipédia (fr) — Loi sur la presse du 9 septembre 1835",
            },
            {
              url: "https://www.medias19.org/textes-du-19e-siecle/anthologies/la-presse-en-scene/annexe-2-loi-du-9-septembre-1835",
              label: "Médias 19 — text of the law of 9 September 1835",
            },
            {
              url: "https://sk.sagepub.com/ency/edvol/the-sage-encyclopedia-of-journalism-2e/chpt/havas",
              label: "SAGE Encyclopedia of Journalism — Havas",
            },
            {
              url: "https://en.wikipedia.org/wiki/Charles-Louis_Havas",
              label: "Wikipedia — Charles-Louis Havas",
            },
            {
              url: "https://gallica.bnf.fr/selections/fr/html/presse-et-revues/le-comte-de-monte-cristo-en-feuilleton",
              label: "Gallica (BnF) — Le Comte de Monte-Cristo en feuilleton",
            },
            {
              url: "https://www.encyclopedia.com/children/academic-and-educational-journals/alexandre-dumas-pere",
              label: "Encyclopedia.com — Alexandre Dumas (père)",
            },
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
