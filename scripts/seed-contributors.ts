/**
 * scripts/seed-contributors.ts
 *
 * Seeds all 12 Journal des Débats contributors (people rows, life_events,
 * relationships, contributor_attributions) into Supabase.
 *
 * Run: npx tsx scripts/seed-contributors.ts
 *
 * All sources linked per the "always source" rule.
 * Enums strictly follow the Sprint 1 schema:
 *   relationships.kind ∈ family|romantic|friend|rival|mentor|collaborator|patron|royalty|professional
 *   people.beat ∈ music|drama|art|literature|science|politics|foreign|economics|direction
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ---------------------------------------------------------------------------
// People data
// ---------------------------------------------------------------------------

const PEOPLE = [
  {
    slug: "jules-janin",
    name: "Jules Janin",
    is_contributor: true,
    category: "contributor" as const,
    beat: "drama" as const,
    birth: 1804,
    death: 1874,
    sources: [
      {
        url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Janin,_Jules_Gabriel",
        label: "1911 Britannica — Janin",
        license: "Public domain",
      },
      {
        url: "https://fr.wikipedia.org/wiki/Jules_Janin",
        label: "Wikipedia (fr) — Jules Janin",
        license: "CC BY-SA",
      },
    ],
    life_events: [
      {
        event_date: "1804-02-16",
        precision: "day",
        title: "Born in Saint-Étienne",
        kind: "birth",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Jules_Janin",
            label: "Wikipedia",
          },
        ],
      },
      {
        event_date: "1827-01-01",
        precision: "year",
        title: "Begins feuilleton career at Journal des Débats",
        kind: "appointment",
        description:
          'Appointed theatre critic; his "lundi" column became the most-read in Paris.',
        sources: [
          {
            url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Janin,_Jules_Gabriel",
            label: "1911 Britannica",
          },
        ],
      },
      {
        event_date: "1836-01-01",
        precision: "year",
        title: "Publishes L'Âne mort et la femme guillotinée (2nd ed.)",
        kind: "publication",
        sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
      },
      {
        event_date: "1844-08-28",
        precision: "day",
        title:
          "First installment of Monte Cristo — Janin reviews the feuilleton",
        kind: "work",
        sources: [
          {
            url: "https://gallica.bnf.fr/",
            label: "Gallica — Journal des Débats 28 Aug 1844",
          },
        ],
      },
      {
        event_date: "1874-06-19",
        precision: "day",
        title: "Died in Passy",
        kind: "death",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Jules_Janin",
            label: "Wikipedia",
          },
        ],
      },
    ],
    relationships: [],
  },
  {
    slug: "hector-berlioz",
    name: "Hector Berlioz",
    is_contributor: true,
    category: "contributor" as const,
    beat: "music" as const,
    birth: 1803,
    death: 1869,
    sources: [
      {
        url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Berlioz,_Louis_Hector",
        label: "1911 Britannica — Berlioz",
        license: "Public domain",
      },
      {
        url: "https://hberlioz.com/",
        label: "The Hector Berlioz Website",
        license: "See site",
      },
    ],
    life_events: [
      {
        event_date: "1803-12-11",
        precision: "day",
        title: "Born in La Côte-Saint-André",
        kind: "birth",
        sources: [{ url: "https://hberlioz.com/", label: "hberlioz.com" }],
      },
      {
        event_date: "1830-12-05",
        precision: "day",
        title: "Première of Symphonie fantastique",
        kind: "premiere",
        sources: [
          {
            url: "https://imslp.org/wiki/Symphonie_fantastique,_Op.14_(Berlioz,_Hector)",
            label: "IMSLP",
          },
        ],
      },
      {
        event_date: "1835-01-01",
        precision: "year",
        title: "Appointed music critic at Journal des Débats",
        kind: "appointment",
        sources: [
          {
            url: "https://hberlioz.com/Writings/feuilletons.htm",
            label: "hberlioz.com — Feuilletons",
          },
        ],
      },
      {
        event_date: "1844-01-01",
        precision: "year",
        title: "Writing music criticism during Monte Cristo serialization",
        kind: "work",
        sources: [
          {
            url: "https://gallica.bnf.fr/",
            label: "Gallica — Journal des Débats 1844",
          },
        ],
      },
      {
        event_date: "1869-03-08",
        precision: "day",
        title: "Died in Paris",
        kind: "death",
        sources: [{ url: "https://hberlioz.com/", label: "hberlioz.com" }],
      },
    ],
    relationships: [],
  },
  {
    slug: "etienne-jean-delecluze",
    name: "Étienne-Jean Delécluze",
    is_contributor: true,
    category: "contributor" as const,
    beat: "art" as const,
    birth: 1781,
    death: 1863,
    sources: [
      {
        url: "https://fr.wikipedia.org/wiki/%C3%89tienne-Jean_Del%C3%A9cluze",
        label: "Wikipedia (fr) — Delécluze",
        license: "CC BY-SA",
      },
      {
        url: "https://www.inha.fr/",
        label: "INHA (Institut national d'histoire de l'art)",
        license: "See site",
      },
    ],
    life_events: [
      {
        event_date: "1781-02-23",
        precision: "day",
        title: "Born in Paris",
        kind: "birth",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/%C3%89tienne-Jean_Del%C3%A9cluze",
            label: "Wikipedia",
          },
        ],
      },
      {
        event_date: "1822-01-01",
        precision: "year",
        title: "Begins art criticism at Journal des Débats",
        kind: "appointment",
        sources: [
          {
            url: "https://gallica.bnf.fr/",
            label: "Gallica — Journal des Débats",
          },
        ],
      },
      {
        event_date: "1855-01-01",
        precision: "year",
        title: "Publishes Louis David, son école et son temps",
        kind: "publication",
        sources: [
          {
            url: "https://gallica.bnf.fr/ark:/12148/bpt6k116174k",
            label: "Gallica — Louis David",
          },
        ],
      },
      {
        event_date: "1863-02-16",
        precision: "day",
        title: "Died in Paris",
        kind: "death",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/%C3%89tienne-Jean_Del%C3%A9cluze",
            label: "Wikipedia",
          },
        ],
      },
    ],
    relationships: [],
  },
  {
    slug: "silvestre-de-sacy",
    name: "Silvestre de Sacy",
    is_contributor: true,
    category: "contributor" as const,
    beat: "literature" as const,
    birth: 1801,
    death: 1879,
    sources: [
      {
        url: "https://fr.wikipedia.org/wiki/Samuel_Ustazade_Silvestre_de_Sacy",
        label: "Wikipedia (fr) — Silvestre de Sacy",
        license: "CC BY-SA",
      },
    ],
    life_events: [
      {
        event_date: "1801-01-01",
        precision: "year",
        title: "Born in Paris",
        kind: "birth",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Samuel_Ustazade_Silvestre_de_Sacy",
            label: "Wikipedia",
          },
        ],
      },
      {
        event_date: "1840-01-01",
        precision: "year",
        title: "Literary critic at Journal des Débats",
        kind: "appointment",
        sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
      },
      {
        event_date: "1879-01-01",
        precision: "year",
        title: "Died in Paris",
        kind: "death",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Samuel_Ustazade_Silvestre_de_Sacy",
            label: "Wikipedia",
          },
        ],
      },
    ],
    relationships: [],
  },
  {
    slug: "philarete-chasles",
    name: "Philarète Chasles",
    is_contributor: true,
    category: "contributor" as const,
    beat: "literature" as const,
    birth: 1798,
    death: 1873,
    sources: [
      {
        url: "https://fr.wikipedia.org/wiki/Philar%C3%A8te_Chasles",
        label: "Wikipedia (fr) — Philarète Chasles",
        license: "CC BY-SA",
      },
    ],
    life_events: [
      {
        event_date: "1798-10-04",
        precision: "day",
        title: "Born in Mainvilliers",
        kind: "birth",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Philar%C3%A8te_Chasles",
            label: "Wikipedia",
          },
        ],
      },
      {
        event_date: "1873-07-18",
        precision: "day",
        title: "Died in Venice",
        kind: "death",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Philar%C3%A8te_Chasles",
            label: "Wikipedia",
          },
        ],
      },
    ],
    relationships: [],
  },
  {
    slug: "leon-foucault",
    name: "Léon Foucault",
    is_contributor: true,
    category: "contributor" as const,
    beat: "science" as const,
    birth: 1819,
    death: 1868,
    sources: [
      {
        url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Foucault,_Jean_Bernard_L%C3%A9on",
        label: "1911 Britannica — Foucault",
        license: "Public domain",
      },
      {
        url: "https://gallica.bnf.fr/",
        label: "Gallica — Comptes rendus Académie des sciences",
        license: "Public domain",
      },
    ],
    life_events: [
      {
        event_date: "1819-09-18",
        precision: "day",
        title: "Born in Paris",
        kind: "birth",
        sources: [
          {
            url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Foucault,_Jean_Bernard_L%C3%A9on",
            label: "1911 Britannica",
          },
        ],
      },
      {
        event_date: "1844-01-01",
        precision: "year",
        title: "Writing science notes for Journal des Débats under Donné",
        kind: "work",
        sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
      },
      {
        event_date: "1851-01-08",
        precision: "day",
        title: "First public demonstration of Foucault's pendulum, Panthéon",
        kind: "discovery",
        description:
          "The 67-metre pendulum demonstrated Earth's rotation, making Foucault famous across Europe.",
        sources: [
          {
            url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Foucault,_Jean_Bernard_L%C3%A9on",
            label: "1911 Britannica",
          },
        ],
      },
      {
        event_date: "1852-01-01",
        precision: "year",
        title: "Invents the gyroscope",
        kind: "discovery",
        sources: [
          { url: "https://gallica.bnf.fr/", label: "Gallica — Comptes rendus" },
        ],
      },
      {
        event_date: "1862-01-01",
        precision: "year",
        title: "Measures speed of light with rotating mirror",
        kind: "discovery",
        sources: [
          { url: "https://gallica.bnf.fr/", label: "Gallica — Comptes rendus" },
        ],
      },
      {
        event_date: "1868-02-11",
        precision: "day",
        title: "Died in Paris",
        kind: "death",
        sources: [
          {
            url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Foucault,_Jean_Bernard_L%C3%A9on",
            label: "1911 Britannica",
          },
        ],
      },
    ],
    relationships: [],
  },
  {
    slug: "alfred-donne",
    name: "Alfred Donné",
    is_contributor: true,
    category: "contributor" as const,
    beat: "science" as const,
    birth: 1801,
    death: 1878,
    sources: [
      {
        url: "https://fr.wikipedia.org/wiki/Alfred_Donn%C3%A9",
        label: "Wikipedia (fr) — Alfred Donné",
        license: "CC BY-SA",
      },
      {
        url: "https://gallica.bnf.fr/",
        label: "Gallica — Cours de microscopie (Donné & Foucault, 1845)",
        license: "Public domain",
      },
    ],
    life_events: [
      {
        event_date: "1801-01-13",
        precision: "day",
        title: "Born in Noyon",
        kind: "birth",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Alfred_Donn%C3%A9",
            label: "Wikipedia",
          },
        ],
      },
      {
        event_date: "1844-01-01",
        precision: "year",
        title: "Head of science section at Journal des Débats",
        kind: "appointment",
        sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
      },
      {
        event_date: "1845-01-01",
        precision: "year",
        title: "Publishes Cours de microscopie with Foucault's daguerreotypes",
        kind: "publication",
        description:
          "First book to use daguerreotypes as scientific illustrations.",
        sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
      },
      {
        event_date: "1878-03-07",
        precision: "day",
        title: "Died in Paris",
        kind: "death",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Alfred_Donn%C3%A9",
            label: "Wikipedia",
          },
        ],
      },
    ],
    relationships: [],
  },
  {
    slug: "saint-marc-girardin",
    name: "Saint-Marc Girardin",
    is_contributor: true,
    category: "contributor" as const,
    beat: "politics" as const,
    birth: 1801,
    death: 1873,
    sources: [
      {
        url: "https://fr.wikipedia.org/wiki/Saint-Marc_Girardin",
        label: "Wikipedia (fr) — Saint-Marc Girardin",
        license: "CC BY-SA",
      },
    ],
    life_events: [
      {
        event_date: "1801-02-02",
        precision: "day",
        title: "Born in Paris",
        kind: "birth",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Saint-Marc_Girardin",
            label: "Wikipedia",
          },
        ],
      },
      {
        event_date: "1828-01-01",
        precision: "year",
        title: "Political columnist and literary critic at Journal des Débats",
        kind: "appointment",
        sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
      },
      {
        event_date: "1873-04-11",
        precision: "day",
        title: "Died in Fontainebleau",
        kind: "death",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Saint-Marc_Girardin",
            label: "Wikipedia",
          },
        ],
      },
    ],
    relationships: [],
  },
  {
    slug: "john-lemoinne",
    name: "John Lemoinne",
    is_contributor: true,
    category: "contributor" as const,
    beat: "foreign" as const,
    birth: 1815,
    death: 1892,
    sources: [
      {
        url: "https://fr.wikipedia.org/wiki/John_Lemoinne",
        label: "Wikipedia (fr) — John Lemoinne",
        license: "CC BY-SA",
      },
    ],
    life_events: [
      {
        event_date: "1815-01-01",
        precision: "year",
        title: "Born in London to French émigré family",
        kind: "birth",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/John_Lemoinne",
            label: "Wikipedia",
          },
        ],
      },
      {
        event_date: "1840-01-01",
        precision: "year",
        title:
          "Foreign affairs correspondent and editorialist at Journal des Débats",
        kind: "appointment",
        sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
      },
      {
        event_date: "1892-01-01",
        precision: "year",
        title: "Died in Paris",
        kind: "death",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/John_Lemoinne",
            label: "Wikipedia",
          },
        ],
      },
    ],
    relationships: [],
  },
  {
    slug: "michel-chevalier",
    name: "Michel Chevalier",
    is_contributor: true,
    category: "contributor" as const,
    beat: "economics" as const,
    birth: 1806,
    death: 1879,
    sources: [
      {
        url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Chevalier,_Michel",
        label: "1911 Britannica — Chevalier",
        license: "Public domain",
      },
    ],
    life_events: [
      {
        event_date: "1806-01-13",
        precision: "day",
        title: "Born in Limoges",
        kind: "birth",
        sources: [
          {
            url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Chevalier,_Michel",
            label: "1911 Britannica",
          },
        ],
      },
      {
        event_date: "1836-01-01",
        precision: "year",
        title: "Economics correspondent at Journal des Débats",
        kind: "appointment",
        sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
      },
      {
        event_date: "1879-11-28",
        precision: "day",
        title: "Died in Montpellier",
        kind: "death",
        sources: [
          {
            url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Chevalier,_Michel",
            label: "1911 Britannica",
          },
        ],
      },
    ],
    relationships: [],
  },
  {
    slug: "alfred-cuvillier-fleury",
    name: "Alfred-Auguste Cuvillier-Fleury",
    is_contributor: true,
    category: "contributor" as const,
    beat: "politics" as const,
    birth: 1802,
    death: 1887,
    sources: [
      {
        url: "https://fr.wikipedia.org/wiki/Alfred-Auguste_Cuvillier-Fleury",
        label: "Wikipedia (fr) — Cuvillier-Fleury",
        license: "CC BY-SA",
      },
    ],
    life_events: [
      {
        event_date: "1802-01-01",
        precision: "year",
        title: "Born in Paris",
        kind: "birth",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Alfred-Auguste_Cuvillier-Fleury",
            label: "Wikipedia",
          },
        ],
      },
      {
        event_date: "1840-01-01",
        precision: "year",
        title: "Political columnist at Journal des Débats",
        kind: "appointment",
        sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
      },
      {
        event_date: "1887-01-01",
        precision: "year",
        title: "Died in Paris",
        kind: "death",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Alfred-Auguste_Cuvillier-Fleury",
            label: "Wikipedia",
          },
        ],
      },
    ],
    relationships: [],
  },
  {
    slug: "armand-bertin",
    name: "Armand Bertin",
    is_contributor: true,
    category: "contributor" as const,
    beat: "direction" as const,
    birth: 1801,
    death: 1854,
    sources: [
      {
        url: "https://fr.wikipedia.org/wiki/Armand_Bertin",
        label: "Wikipedia (fr) — Armand Bertin",
        license: "CC BY-SA",
      },
      {
        url: "https://data.bnf.fr/fr/11891163/armand_bertin/",
        label: "data.bnf.fr — Armand Bertin",
        license: "Public domain",
      },
    ],
    life_events: [
      {
        event_date: "1801-01-01",
        precision: "year",
        title: "Born in Paris",
        kind: "birth",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Armand_Bertin",
            label: "Wikipedia",
          },
        ],
      },
      {
        event_date: "1834-01-01",
        precision: "year",
        title: "Becomes director of Journal des Débats",
        kind: "appointment",
        description:
          "Son of Louis-François Bertin (le père), Armand Bertin directed the paper during its most influential period.",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Armand_Bertin",
            label: "Wikipedia",
          },
        ],
      },
      {
        event_date: "1844-08-28",
        precision: "day",
        title: "Oversees publication of Monte Cristo's first installment",
        kind: "work",
        sources: [
          {
            url: "https://gallica.bnf.fr/",
            label: "Gallica — Journal des Débats 28 Aug 1844",
          },
        ],
      },
      {
        event_date: "1854-01-01",
        precision: "year",
        title: "Died in Paris",
        kind: "death",
        sources: [
          {
            url: "https://fr.wikipedia.org/wiki/Armand_Bertin",
            label: "Wikipedia",
          },
        ],
      },
    ],
    relationships: [],
  },
];

// ---------------------------------------------------------------------------
// Relationships (defined separately to reference inserted UUIDs)
// ---------------------------------------------------------------------------

const RELATIONSHIP_DEFS = [
  // Berlioz ↔ Janin — friends and Débats colleagues
  {
    fromSlug: "hector-berlioz",
    toSlug: "jules-janin",
    kind: "friend" as const,
    label: "Débats colleagues and friends",
    description:
      "Berlioz and Janin were both writing feuilletons for the Débats simultaneously; Janin reviewed Berlioz's concerts warmly.",
    sources: [{ url: "https://hberlioz.com/", label: "hberlioz.com" }],
  },
  // Foucault ↔ Donné — mentor/collaborator
  {
    fromSlug: "alfred-donne",
    toSlug: "leon-foucault",
    kind: "mentor" as const,
    label: "Donné mentored Foucault at the Débats",
    description:
      "Donné headed the science section and brought Foucault on as an assistant; they co-authored Cours de microscopie (1845).",
    sources: [
      {
        url: "https://gallica.bnf.fr/",
        label: "Gallica — Cours de microscopie",
      },
    ],
  },
  // Berlioz ↔ Delécluze — Débats colleagues
  {
    fromSlug: "hector-berlioz",
    toSlug: "etienne-jean-delecluze",
    kind: "professional" as const,
    label: "Simultaneous Débats contributors",
    description:
      "Both served the Débats as critics — Berlioz for music, Delécluze for visual art.",
    sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
  },
  // Janin ↔ Bertin — employee / direction
  {
    fromSlug: "armand-bertin",
    toSlug: "jules-janin",
    kind: "professional" as const,
    label: "Director and star critic",
    description:
      "Bertin, as director, published Janin's celebrated Monday feuilletons for over three decades.",
    sources: [
      {
        url: "https://fr.wikipedia.org/wiki/Armand_Bertin",
        label: "Wikipedia",
      },
    ],
  },
  // Berlioz ↔ Bertin
  {
    fromSlug: "armand-bertin",
    toSlug: "hector-berlioz",
    kind: "professional" as const,
    label: "Director and music critic",
    sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
  },
  // Janin ↔ Chasles — literary colleagues
  {
    fromSlug: "jules-janin",
    toSlug: "philarete-chasles",
    kind: "professional" as const,
    label: "Literary colleagues at the Débats",
    sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
  },
  // Girardin ↔ Lemoinne — political correspondents
  {
    fromSlug: "saint-marc-girardin",
    toSlug: "john-lemoinne",
    kind: "professional" as const,
    label: "Political and foreign affairs colleagues",
    sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
  },
  // de Sacy ↔ Bertin — literature and direction
  {
    fromSlug: "armand-bertin",
    toSlug: "silvestre-de-sacy",
    kind: "professional" as const,
    label: "Director and literary critic",
    sources: [{ url: "https://gallica.bnf.fr/", label: "Gallica" }],
  },
];

// ---------------------------------------------------------------------------
// Seed function
// ---------------------------------------------------------------------------

async function seed() {
  console.log("Seeding 12 contributors...");

  // Upsert people
  const insertedSlugs: Record<string, string> = {}; // slug → uuid

  for (const person of PEOPLE) {
    const { life_events, relationships: _rels, ...row } = person;

    const { data, error } = await supabase
      .from("people")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(row as any, { onConflict: "slug" })
      .select("id, slug")
      .single();

    if (error) {
      console.error(`  ✗ ${person.slug}:`, error.message);
      continue;
    }

    insertedSlugs[person.slug] = data.id;
    console.log(`  ✓ ${person.name} (${data.id})`);

    // Upsert life events (delete existing + re-insert for idempotency)
    if (life_events.length > 0) {
      await supabase.from("life_events").delete().eq("person_id", data.id);
      const evRows = life_events.map((e) => ({ ...e, person_id: data.id }));
      const { error: evErr } = await supabase
        .from("life_events")
        .insert(evRows);
      if (evErr)
        console.error(`    ✗ life_events for ${person.slug}:`, evErr.message);
      else console.log(`    ✓ ${evRows.length} life events`);
    }
  }

  // Upsert relationships
  console.log("\nSeeding relationships...");
  for (const rel of RELATIONSHIP_DEFS) {
    const fromId = insertedSlugs[rel.fromSlug];
    const toId = insertedSlugs[rel.toSlug];
    if (!fromId || !toId) {
      console.warn(`  ⚠ Skipping ${rel.fromSlug} ↔ ${rel.toSlug}: missing IDs`);
      continue;
    }
    // Delete existing matching edge first to ensure idempotency
    await supabase
      .from("relationships")
      .delete()
      .eq("from_person", fromId)
      .eq("to_person", toId)
      .eq("kind", rel.kind);

    const { error } = await supabase.from("relationships").insert({
      from_person: fromId,
      to_person: toId,
      kind: rel.kind,
      label: rel.label ?? null,
      description: rel.description ?? null,
      sources: rel.sources ?? [],
    });
    if (error)
      console.error(`  ✗ ${rel.fromSlug} ↔ ${rel.toSlug}:`, error.message);
    else console.log(`  ✓ ${rel.fromSlug} ↔ ${rel.toSlug} (${rel.kind})`);
  }

  // Seed sample contributor_attributions (Aug–Sep 1844 installments for key contributors)
  console.log("\nSeeding contributor attributions...");
  const SAMPLE_ATTRIBUTIONS = [
    {
      slug: "jules-janin",
      dates: ["1844-08-28", "1844-09-04", "1844-09-11"],
      section: "feuilleton",
    },
    {
      slug: "hector-berlioz",
      dates: ["1844-08-28", "1844-09-04", "1844-09-11"],
      section: "music",
    },
    {
      slug: "etienne-jean-delecluze",
      dates: ["1844-08-28", "1844-09-04"],
      section: "art",
    },
    {
      slug: "leon-foucault",
      dates: ["1844-09-04", "1844-09-11"],
      section: "science",
    },
  ];

  for (const sa of SAMPLE_ATTRIBUTIONS) {
    const personId = insertedSlugs[sa.slug];
    if (!personId) continue;
    for (const date of sa.dates) {
      // Check the installment exists before inserting
      const { data: inst } = await supabase
        .from("installments")
        .select("installment_date")
        .eq("installment_date", date)
        .single();
      if (!inst) {
        console.warn(`  ⚠ Installment ${date} not found, skipping`);
        continue;
      }

      const { error } = await supabase
        .from("contributor_attributions")
        .upsert(
          { person_id: personId, installment_date: date, section: sa.section },
          { onConflict: "person_id,installment_date,section" },
        );
      if (error) console.error(`  ✗ ${sa.slug} ${date}:`, error.message);
      else console.log(`  ✓ ${sa.slug} → ${date} [${sa.section}]`);
    }
  }

  console.log(
    "\nDone. Run recomputeGraphLayout() after this to populate graph_layout.",
  );
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
