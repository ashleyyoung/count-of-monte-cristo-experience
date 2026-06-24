"use client";

/**
 * components/debats/PressRoom.tsx
 *
 * "The Press Room": how a daily newspaper was physically made in 1840s Paris.
 * Covers the lineage of press technology, page dimensions, hand composition,
 * page layout, the machines, the size of the workforce, working conditions,
 * the paper supply chain, the absence of illustration, and the nightly rhythm.
 *
 * Mirrors PaperProfile.tsx: styled prose primitives, footnoted Cite markers,
 * a sources footer, and EditableText admin overlay via upsertEditorialBlock.
 */

import styled from "styled-components";
import { useRouter } from "next/navigation";
import Cite, { type CiteSource } from "@/components/ui/Cite";
import EditableText from "@/components/admin/primitives/EditableText";
import { upsertEditorialBlock } from "@/app/actions/admin";
import PrintingTechTimeline from "./PrintingTechTimeline";

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Article = styled.article`
  max-width: 72ch;
`;

const Section = styled.section`
  margin-bottom: 2.5rem;
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
  &:hover {
    color: var(--oxblood);
  }
`;

// ---------------------------------------------------------------------------
// Static fallback text for admin editing (initial value for each section)
// ---------------------------------------------------------------------------

const SECTION_TEXT: Record<string, string> = {
  "press-room-dimensions": `The Débats settled its modern shape in 1827, enlarging to roughly 330 by 450 millimetres to carry about half a page of advertising a day. Each issue ran to four pages of three columns. At its 1789 founding it had been a small in-octavo of about 130 by 210 millimetres, and as the Journal de l'Empire under Napoleon it grew to a grand in-quarto of about 230 by 350 millimetres. The feuilleton occupied the bottom strip of page one.`,
  "press-room-handset": `From Gutenberg until the Linotype arrived in 1886, every letter was a separate cast-metal sort. A compositor stood at a type case, the capitals in the upper case and the small letters in the lower case, picked sorts one at a time, and assembled them upside down and right to left in a hand-held composing stick, adding lead spaces to justify each line to an even width. Full lines went to a galley, proofs were pulled and read, and the type was made up into pages and locked with furniture and quoins into an iron chase, producing a forme. After printing came distribution: each sort hand-returned to its compartment, a task nearly as slow as the setting. Mechanical setters such as the Young and Delcambre pianotype won a medal at the 1844 Paris exposition and ran briefly in Paris shops, then were set aside; hand composition stayed standard through the whole Monte Cristo run. Stereotyping, a French technique improved by Louis-Etienne Herhan around 1800, cast a solid plate from a finished forme so a page could be preserved and rerun without resetting it.`,
  "press-room-layout": `Someone had to make it all fit. A secretary of the editorial staff and the metteur en pages gathered the day's copy, cast off how much type each piece would make, and fitted it column by column on the imposing stone, the marbre. A printed rule fenced the feuilleton from the news above. When a forme held more than the page, copy was cut, held, or carried to the next day. The make-up was finalized at a fixed point known as off stone, after which the locked forme went to press and any urgent late news went in as a separate stop-press.`,
  "press-room-machines": `The Débats was an early adopter of mechanized printing, running on Napier drum-cylinder machines from about 1825. The steam cylinder press built by Friedrich Koenig and Andreas Bauer, first used at The Times of London in 1814, reached roughly 1,100 sheets an hour. Richard Hoe's type-revolving rotary press, patented in the United States in 1843, reached Paris with La Patrie in 1846 and could approach 8,000 impressions an hour.`,
  "press-room-hands": `Typesetting alone was the largest single trade in the shop. Paris counted roughly 2,234 typesetters in 1801, about 3,000 to 3,500 compositeurs-typographes by 1860, and more than 8,900 book workers by 1865. For scale, the Imprimerie impériale in 1855 ran 120 presses with 345 workers, of whom 143 were compositors and 185 were pressmen. A skilled compositor set only a few thousand characters an hour, so a dense four-page daily required many setters working in parallel through the night. Daily wages ran about 4 francs early in the century and rose toward 5 by the 1840s; women were hired as setters at one-half to one-third of male pay.`,
  "press-room-conditions": `The corrector, the correcteur, was a respected and often erudite figure, the last guard against the coquille, the stray wrong letter. The work carried real hazard: compositors handled lead type daily and faced saturnism, lead poisoning, while close overnight rooms encouraged respiratory illness. The trade kept its own customs through the chapelle, the print shop's workers' association.`,
  "press-room-paper": `Newsprint of the period was made from rags, the woodpulp paper familiar today arrived only in the 1880s. The rag came through a citywide trade fed by the chiffonniers, the rag-pickers of Paris, and paper was among the largest costs of an issue. Each sheet was dampened before printing so it would take ink cleanly, then dried.`,
  "press-room-pictures": `A daily was solid columns of type because engraving a picture took longer than an overnight deadline allowed. Illustration belonged to the weeklies, such as L'Illustration, founded in 1843, where the slower work of the woodblock had time to be done.`,
  "press-room-rhythm": `A morning daily was a nightly performance. Copy arrived through the evening, the compositors set it overnight, the make-up reached off stone in the small hours, and the presses ran so the issue could reach subscribers, kiosks, cafés, and reading rooms at dawn.`,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PressRoom() {
  const router = useRouter();

  const cites: CiteSource[] = [
    {
      title: "La presse à la une, fiche presse",
      attribution: "Bibliothèque nationale de France",
      license: "Public Domain",
      translation_source_url: "https://classes.bnf.fr/pdf/Fiche-presse1.pdf",
    },
    {
      title: "The Linotype: The Machine that Revolutionized Movable Type",
      attribution: "Library of Congress, Headlines & Heroes (2022)",
      translation_source_url:
        "https://blogs.loc.gov/headlinesandheroes/2022/06/the-linotype-the-machine-that-revolutionized-movable-type/",
    },
    {
      title: "La modernisation de la composition typographique",
      attribution: "Revue d'histoire moderne et contemporaine (Cairn, 2007)",
      translation_source_url:
        "https://shs.cairn.info/journal-revue-d-histoire-moderne-et-contemporaine-2007-1-page-193?lang=en",
    },
    {
      title: "The Earliest French and German Accounts of the Machine Press",
      attribution: "History of Information (citing Moran, Printing Presses)",
      translation_source_url:
        "https://www.historyofinformation.com/detail.php?id=4419",
    },
    {
      title: "Koenig's mechanical press, early 19th century",
      attribution: "Encyclopædia Britannica",
      translation_source_url:
        "https://www.britannica.com/topic/printing-publishing/Koenigs-mechanical-press-early-19th-century",
    },
    {
      title:
        "Les ouvriers du livre et la Révolution industrielle en France au XIXe siècle",
      attribution: "Revue du Nord (Persée, 1981)",
      translation_source_url:
        "https://www.persee.fr/doc/rnord_0035-2624_1981_num_63_248_3762",
    },
    {
      title: "Compositeur-typographe de Paris",
      attribution: "Les Ouvriers des deux mondes",
      translation_source_url:
        "https://ouvriersdeuxmondes.huma-num.fr/monographie/compositeur-typographe-paris-33",
    },
    {
      title: "Working Women in the printing trades",
      attribution: "Grolier Club, The Second Printing Revolution",
      translation_source_url:
        "https://grolierclub.omeka.net/exhibits/show/second-printing-revolution/working-women",
    },
    {
      title: "Press and Newspapers",
      attribution: "Encyclopedia.com",
      translation_source_url:
        "https://www.encyclopedia.com/history/encyclopedias-almanacs-transcripts-and-maps/press-and-newspapers-0",
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
        Printing four pages every morning, years before any machine could set a
        line of type, was a feat of coordination and muscle. Here is how a Paris
        daily of the 1840s was actually made.
      </Lede>

      <Section>
        <H2>From Gutenberg to the Cylinder Press</H2>
        <P>
          A daily as fast as the Débats rested on four centuries of invention,
          then on a sudden burst of it in the early 1800s. Hover any point to
          see the inventor and the breakthrough.
        </P>
        <PrintingTechTimeline />
      </Section>

      <Section>
        <H2>The Page Itself</H2>
        <EditableText
          value={SECTION_TEXT["press-room-dimensions"]}
          onSave={makeSectionSave("press-room-dimensions", "The Page Itself")}
        >
          <P>
            The Débats settled its modern shape in 1827, enlarging to roughly
            330 by 450 millimetres to carry about half a page of advertising a
            day. Each issue ran to four pages of three columns. At its 1789
            founding it had been a small in-octavo of about 130 by 210
            millimetres, and as the Journal de l&apos;Empire under Napoleon it
            grew to a grand in-quarto of about 230 by 350 millimetres. The
            feuilleton occupied the bottom strip of page one.
            <Cite source={cites[0]} n={1} />
          </P>
        </EditableText>
      </Section>

      <Section>
        <H2>Set by Hand, Letter by Letter</H2>
        <EditableText
          value={SECTION_TEXT["press-room-handset"]}
          onSave={makeSectionSave(
            "press-room-handset",
            "Set by Hand, Letter by Letter",
          )}
        >
          <P>
            Yes, every letter was set by hand. From Gutenberg until the Linotype
            arrived in 1886, each character was a separate cast-metal sort. A
            compositor stood at a type case, the capitals in the upper case and
            the small letters in the lower case, picked sorts one at a time, and
            assembled them upside down and right to left in a hand-held
            composing stick, adding thin lead spaces to justify each line to an
            even width.<Cite source={cites[1]} n={2} />
          </P>
          <P>
            Full lines passed to a tray called a galley; proofs were pulled and
            read; then the type was made up into pages and locked with wooden
            and metal furniture and tightening quoins into an iron frame, the
            chase, producing a forme ready for the press. After the run came
            distribution, the reverse job of returning every sort to its
            compartment for reuse, nearly as slow as the setting itself.
          </P>
          <P>
            Machines were tried. The Young and Delcambre pianotype won a medal
            at the 1844 Paris exposition and ran for a time in Paris shops, then
            was set aside as too fragile for daily work; hand composition stayed
            the standard through the whole Monte Cristo run. One labor-saving
            method did take hold: stereotyping, a French technique improved by
            Louis-Etienne Herhan around 1800, cast a solid metal plate from a
            finished forme so a page could be preserved and rerun without
            resetting it.<Cite source={cites[2]} n={3} />
          </P>
        </EditableText>
      </Section>

      <Section>
        <H2>Laying Out the Page</H2>
        <EditableText
          value={SECTION_TEXT["press-room-layout"]}
          onSave={makeSectionSave("press-room-layout", "Laying Out the Page")}
        >
          <P>
            Someone had to make it all fit. A secretary of the editorial staff
            and the metteur en pages, the make-up man, gathered the day&apos;s
            copy, cast off how much type each article would make, and fitted it
            column by column on the imposing stone, the marbre. A printed rule
            fenced the feuilleton from the news above.
          </P>
          <P>
            When a forme held more than the page allowed, copy was cut, held, or
            carried to the next day. The make-up was finalized at a fixed point
            the trade called off stone, after which the locked forme went to
            press and any urgent late news went in as a separate stop-press.
          </P>
        </EditableText>
      </Section>

      <Section>
        <H2>The Machines</H2>
        <EditableText
          value={SECTION_TEXT["press-room-machines"]}
          onSave={makeSectionSave("press-room-machines", "The Machines")}
        >
          <P>
            The Débats was an early adopter of mechanized printing, running on
            Napier drum-cylinder machines from about 1825.
            <Cite source={cites[3]} n={4} /> The steam cylinder press built by
            Friedrich Koenig and Andreas Bauer, first used at The Times of
            London in 1814, reached roughly 1,100 sheets an hour, far beyond the
            few hundred a hand press could pull. Richard Hoe&apos;s
            type-revolving rotary press, patented in the United States in 1843,
            reached Paris with La Patrie in 1846 and could approach 8,000
            impressions an hour.<Cite source={cites[4]} n={5} />
          </P>
        </EditableText>
      </Section>

      <Section>
        <H2>How Many Hands</H2>
        <EditableText
          value={SECTION_TEXT["press-room-hands"]}
          onSave={makeSectionSave("press-room-hands", "How Many Hands")}
        >
          <P>
            Typesetting alone was the largest single trade in the shop. Paris
            counted roughly 2,234 typesetters in 1801, about 3,000 to 3,500
            compositeurs-typographes by 1860, and more than 8,900 book workers
            by 1865.<Cite source={cites[5]} n={6} /> For scale, the Imprimerie
            impériale in 1855 ran 120 presses with 345 workers, of whom 143 were
            compositors and 185 were pressmen.
          </P>
          <P>
            A skilled compositor set only a few thousand characters an hour, so
            a dense four-page daily required many setters working in parallel
            through the night.<Cite source={cites[6]} n={7} /> Daily wages ran
            about 4 francs early in the century and rose toward 5 by the 1840s;
            women were hired as setters at one-half to one-third of male pay.
            <Cite source={cites[7]} n={8} />
          </P>
        </EditableText>
      </Section>

      <Section>
        <H2>At the Case, Through the Night</H2>
        <EditableText
          value={SECTION_TEXT["press-room-conditions"]}
          onSave={makeSectionSave(
            "press-room-conditions",
            "At the Case, Through the Night",
          )}
        >
          <P>
            The corrector, the correcteur, was a respected and often erudite
            figure, the last guard against the coquille, the stray wrong letter.
            The work carried real hazard: compositors handled lead type daily
            and faced saturnism, lead poisoning, while close overnight rooms
            encouraged respiratory illness. The trade kept its own customs
            through the chapelle, the print shop&apos;s workers&apos;
            association.
          </P>
        </EditableText>
      </Section>

      <Section>
        <H2>The Paper Itself</H2>
        <EditableText
          value={SECTION_TEXT["press-room-paper"]}
          onSave={makeSectionSave("press-room-paper", "The Paper Itself")}
        >
          <P>
            The paper had a surprising origin. Newsprint of the period was made
            from rags; the woodpulp paper familiar today arrived only in the
            1880s.<Cite source={cites[8]} n={9} /> The rag came through a
            citywide trade fed by the chiffonniers, the rag-pickers of Paris,
            and paper was among the largest costs of an issue.
          </P>
          <Blockquote>
            Each sheet was dampened with water before printing so it would take
            ink cleanly, then dried again after the run, a daily cycle of
            wetting and drying tons of paper.
          </Blockquote>
        </EditableText>
      </Section>

      <Section>
        <H2>Why There Were No Pictures</H2>
        <EditableText
          value={SECTION_TEXT["press-room-pictures"]}
          onSave={makeSectionSave(
            "press-room-pictures",
            "Why There Were No Pictures",
          )}
        >
          <P>
            A daily was solid columns of type because engraving a picture took
            longer than an overnight deadline allowed. Illustration belonged to
            the weeklies, such as L&apos;Illustration, founded in 1843, where
            the slower work of the woodblock had time to be done.
          </P>
        </EditableText>
      </Section>

      <Section>
        <H2>The Nightly Rhythm</H2>
        <EditableText
          value={SECTION_TEXT["press-room-rhythm"]}
          onSave={makeSectionSave("press-room-rhythm", "The Nightly Rhythm")}
        >
          <P>
            A morning daily was a nightly performance. Copy arrived through the
            evening, the compositors set it overnight, the make-up reached off
            stone in the small hours, and the presses ran so the issue could
            reach subscribers, kiosks, cafés, and reading rooms at dawn.
          </P>
        </EditableText>
      </Section>

      <SourcesRow>
        <SourcesLabel>Sources for this page</SourcesLabel>
        <SourceList>
          {[
            {
              url: "https://classes.bnf.fr/pdf/Fiche-presse1.pdf",
              label: "BnF — La presse à la une (fiche presse)",
            },
            {
              url: "https://blogs.loc.gov/headlinesandheroes/2022/06/the-linotype-the-machine-that-revolutionized-movable-type/",
              label: "Library of Congress — The Linotype (Headlines & Heroes)",
            },
            {
              url: "https://grolierclub.omeka.net/exhibits/show/second-printing-revolution/typesetting",
              label: "Grolier Club — The Second Printing Revolution: Typesetting",
            },
            {
              url: "https://shs.cairn.info/journal-revue-d-histoire-moderne-et-contemporaine-2007-1-page-193?lang=en",
              label: "Cairn — Revue d'histoire moderne et contemporaine (2007)",
            },
            {
              url: "https://www.historyofinformation.com/detail.php?id=4419",
              label: "History of Information — the machine press at the Débats",
            },
            {
              url: "https://www.britannica.com/topic/printing-publishing/Koenigs-mechanical-press-early-19th-century",
              label: "Britannica — Koenig's mechanical press",
            },
            {
              url: "https://www.persee.fr/doc/rnord_0035-2624_1981_num_63_248_3762",
              label: "Persée — Les ouvriers du livre au XIXe siècle",
            },
            {
              url: "https://ouvriersdeuxmondes.huma-num.fr/monographie/compositeur-typographe-paris-33",
              label: "Les Ouvriers des deux mondes — Compositeur-typographe de Paris",
            },
            {
              url: "https://grolierclub.omeka.net/exhibits/show/second-printing-revolution/working-women",
              label: "Grolier Club — Working Women in the printing trades",
            },
            {
              url: "https://www.encyclopedia.com/history/encyclopedias-almanacs-transcripts-and-maps/press-and-newspapers-0",
              label: "Encyclopedia.com — Press and Newspapers",
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
