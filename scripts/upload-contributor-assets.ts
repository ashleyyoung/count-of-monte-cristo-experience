/**
 * scripts/upload-contributor-assets.ts
 *
 * Downloads public-domain bio markdown (from hberlioz.com, Wikisource etc.),
 * portrait images from Wikimedia Commons / Gallica, and uploads them to R2,
 * then registers them in Supabase media_assets + people tables.
 *
 * Run: npx tsx scripts/upload-contributor-assets.ts
 *
 * Note: Image downloads may be slow (~10–30 s per file). The script is idempotent —
 * it skips any person whose bio_md_r2_key is already set.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const R2 = new S3Client({
  region: "auto",
  endpoint: process.env.AWS_ENDPOINT_URL_S3!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME ?? "count-of-monte-cristo-experience";

// ---------------------------------------------------------------------------
// Asset definitions
// ---------------------------------------------------------------------------

interface AssetDef {
  slug: string;
  bio: {
    content: string;
    sources: { url: string; label: string; license: string }[];
  };
  autobio?: {
    content: string;
    sources: { url: string; label: string; license: string }[];
  };
  portrait?: {
    url: string;
    attribution: string;
    license: string;
    title: string;
  };
  background?: {
    url: string;
    attribution: string;
    license: string;
    title: string;
  };
}

const ASSETS: AssetDef[] = [
  {
    slug: "jules-janin",
    bio: {
      content: `# Jules Janin (1804–1874)

Jules Gabriel Janin was one of the most celebrated French critics of the nineteenth century, famed for his weekly theatre feuilleton in the *Journal des Débats*. Born in Saint-Étienne on 16 February 1804, he studied in Paris and quickly joined the Débats as its principal dramatic critic around 1827.[^1]

His Monday column — dubbed the "prince of critics" by contemporaries — was the most-read theatre review in Paris for nearly fifty years. Witty, impressionistic, and deeply personal, Janin's prose style influenced a generation of French journalism.[^2]

Beyond criticism Janin wrote novels (including *L'Âne mort et la femme guillotinée*, 1829) and belles-lettres, and in 1870 he was elected to the Académie française. He died in Passy on 19 June 1874.[^1]

## Personality

Janin was known for his warmth and generosity toward young writers, his love of paradox, and his instinct for the theatrical phrase. He was a fixture of literary salons and cultivated friendships with Hector Berlioz and Alexandre Dumas.[^2]

[^1]: Janin, Jules Gabriel | 1911 Encyclopædia Britannica | license=Public domain | url=https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Janin,_Jules_Gabriel
[^2]: Jules Janin | Wikipedia (French) | license=CC BY-SA | url=https://fr.wikipedia.org/wiki/Jules_Janin
`,
      sources: [
        {
          url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Janin,_Jules_Gabriel",
          label: "1911 Britannica",
          license: "Public domain",
        },
        {
          url: "https://fr.wikipedia.org/wiki/Jules_Janin",
          label: "Wikipedia (fr)",
          license: "CC BY-SA",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/9/96/Jules_Janin_by_Nadar.jpg",
      attribution:
        "Nadar (Gaspard-Félix Tournachon), c. 1855 — Metropolitan Museum of Art, via Wikimedia Commons",
      license: "Public domain",
      title: "Jules Janin photographed by Nadar",
    },
  },
  {
    slug: "hector-berlioz",
    bio: {
      content: `# Hector Berlioz (1803–1869)

Louis-Hector Berlioz was a French Romantic composer, conductor, and music critic, one of the dominant figures of nineteenth-century music. Born on 11 December 1803 in La Côte-Saint-André, Isère, he studied medicine briefly before abandoning it for the Paris Conservatoire.[^1]

His *Symphonie fantastique* (1830) inaugurated the programmatic symphony and secured his reputation.[^3] He became music critic for the *Journal des Débats* around 1835, a post he held for nearly thirty years; his feuilletons are models of French critical prose and invaluable documents of Parisian musical life.[^1]

During the Monte Cristo serialization (1844–46) Berlioz was reviewing opera, concerts, and musical events for the Débats weekly, often appearing on the same page as Dumas's feuilleton.[^2]

## Major works
- *Symphonie fantastique*, Op. 14 (1830)
- *Harold en Italie*, Op. 16 (1834)
- *Roméo et Juliette*, Op. 17 (1839)
- *Les Troyens* (1856–58, premiered 1863)
- *Mémoires* (published posthumously, 1870)[^2]

[^1]: Berlioz, Louis Hector | 1911 Encyclopædia Britannica | license=Public domain | url=https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Berlioz,_Louis_Hector
[^2]: The Hector Berlioz Website (hberlioz.com) | Michel Austin & Monir Tayeb | license=See site | url=https://hberlioz.com/
[^3]: Symphonie fantastique, Op. 14 | IMSLP / Petrucci Music Library | license=Public domain | url=https://imslp.org/wiki/Symphonie_fantastique,_Op.14_(Berlioz,_Hector)
`,
      sources: [
        {
          url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Berlioz,_Louis_Hector",
          label: "1911 Britannica",
          license: "Public domain",
        },
        {
          url: "https://hberlioz.com/",
          label: "hberlioz.com",
          license: "See site",
        },
      ],
    },
    autobio: {
      content: `# Berlioz on himself

> I was born on the 11th of December 1803, at La Côte-Saint-André, a very small town in France, in the department of Isère, between Vienne, Grenoble, and Lyon.

> My father was a doctor of some reputation, and an enlightened, liberal, philosophic man. [...] He early inspired me with a love of music; and I remember still the indescribable effect which some of his old flute-and-piano duets produced upon me.

— *Mémoires*, Chapter 1 (posthumously published 1870; trans. Rachel and Eleanor Holmes, 1884)

[Read the full *Mémoires* at hberlioz.com](https://hberlioz.com/Berlioz/memoirs.htm)
`,
      sources: [
        {
          url: "https://hberlioz.com/Berlioz/memoirs.htm",
          label:
            "Berlioz Mémoires, hberlioz.com (trans. Rachel & Eleanor Holmes, 1884)",
          license: "Public domain",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/d/d3/Gustave_Courbet_-_Portrait_of_Hector_Berlioz_-_WGA05492.jpg",
      attribution:
        "Gustave Courbet, 1850 (oil on canvas, RF 2320) — Musée d'Orsay, via Wikimedia Commons",
      license: "Public domain",
      title: "Portrait of Hector Berlioz by Gustave Courbet",
    },
  },
  {
    slug: "leon-foucault",
    bio: {
      content: `# Léon Foucault (1819–1868)

Jean Bernard Léon Foucault was a French physicist best known for his pendulum demonstration of Earth's rotation (1851) and for the invention of the gyroscope (1852). Born in Paris on 18 September 1819, he initially studied medicine but abandoned it for experimental physics.[^1]

During the 1844–46 period of Monte Cristo's serialization, Foucault was an assistant to Alfred Donné in the *Journal des Débats* science section, helping write notes on scientific developments and co-authoring with Donné the pioneering *Cours de microscopie* (1845), the first book illustrated with daguerreotypes.[^2]

His later career was one of the most productive in nineteenth-century physics. He demonstrated Earth's rotation with his famous pendulum at the Panthéon in January 1851, invented the gyroscope in 1852, and in 1862 measured the speed of light with a rotating mirror.[^1]

## Key discoveries (timeline)
- 1845 — *Cours de microscopie* (with Donné): first book with daguerreotype illustrations
- 1851 — Foucault's pendulum: Earth's rotation demonstrated publicly at the Panthéon
- 1852 — Gyroscope invented
- 1862 — Speed-of-light measurement with rotating mirror[^2]

[^1]: Foucault, Jean Bernard Léon | 1911 Encyclopædia Britannica | license=Public domain | url=https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Foucault,_Jean_Bernard_L%C3%A9on
[^2]: Comptes rendus de l'Académie des sciences | Gallica (Bibliothèque nationale de France) | license=Public domain | url=https://gallica.bnf.fr/
`,
      sources: [
        {
          url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Foucault,_Jean_Bernard_L%C3%A9on",
          label: "1911 Britannica",
          license: "Public domain",
        },
        {
          url: "https://gallica.bnf.fr/",
          label: "Gallica — Comptes rendus",
          license: "Public domain",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/9/97/Portrait_Leon_Foucault_1882.jpg",
      attribution:
        "Bertall & Cie., photographic print, 1882 — Bibliothèque nationale de France (Gallica), via Wikimedia Commons",
      license: "Public domain",
      title: "Portrait of Léon Foucault",
    },
  },
  {
    slug: "armand-bertin",
    bio: {
      content: `# Armand Bertin (1801–1854)

Armand Bertin was the director of the *Journal des Débats* during its most influential period, from 1834 until his death in 1854. Son of Louis-François Bertin (*Bertin l'aîné*, 1766–1841), who had rescued the paper during the Consulate, Armand brought it to the height of its cultural prestige.[^1]

Under Armand Bertin's direction the Débats published: feuilletons by Jules Janin, music criticism by Hector Berlioz, art criticism by Étienne-Jean Delécluze, and — crucially — the complete serialization of Alexandre Dumas's *Le Comte de Monte-Cristo* from 28 August 1844 to 15 January 1846.[^1]

Bertin was also a notable collector and patron. He is sometimes confused with his father, whose celebrated 1832 Ingres portrait hangs in the Louvre; a portrait of Armand himself survives in an 1842 Ingres graphite drawing, now at the Metropolitan Museum of Art.[^2]

[^1]: Armand Bertin | Wikipedia (French) | license=CC BY-SA | url=https://fr.wikipedia.org/wiki/Armand_Bertin
[^2]: Armand Bertin | data.bnf.fr (Bibliothèque nationale de France) | license=Public domain | url=https://data.bnf.fr/fr/11891163/armand_bertin/
`,
      sources: [
        {
          url: "https://fr.wikipedia.org/wiki/Armand_Bertin",
          label: "Wikipedia (fr)",
          license: "CC BY-SA",
        },
        {
          url: "https://data.bnf.fr/fr/11891163/armand_bertin/",
          label: "data.bnf.fr",
          license: "Public domain",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/5/52/Ingres%2C_Armand_Bertin_1842%2C_N341.jpg",
      attribution:
        "Jean-Auguste-Dominique Ingres, graphite drawing, 1842 — Metropolitan Museum of Art, via Wikimedia Commons",
      license: "Public domain",
      title: "Portrait of Armand Bertin by Ingres (1842)",
    },
  },
  {
    slug: "etienne-jean-delecluze",
    bio: {
      content: `# Étienne-Jean Delécluze (1781–1863)

Étienne-Jean Delécluze was a painter turned art critic whose four-decade tenure at the *Journal des Débats* made him one of the most influential voices in French art criticism. Born in Paris on 26 February 1781, he trained from 1797 under Jacques-Louis David, becoming one of the master's favored pupils alongside Ingres. He exhibited as a history painter between 1808 and 1814 before largely abandoning the brush for the pen.[^1]

He joined the *Journal des Débats* in 1822 and remained a contributor there for more than forty years, writing primarily on art and the Salon but also on literature and Renaissance history. His criticism carried the authority of someone who had trained inside David's studio and watched Neoclassicism give way to Romanticism from the front row.[^2]

His most enduring work, *Louis David, son école et son temps* (1855), remains a key primary source on David's studio and is still consulted by art historians today. He also wrote novels — including *Florence et ses vicissitudes* (1837) and *Justine de Liron*, which Sainte-Beuve praised as one of the finest studies of female passion in French fiction — along with memoirs, *Souvenirs de soixante années* (1862), and translations of Italian literature, including Dante. He was made a Chevalier de la Légion d'honneur in 1838.[^1]

## Personality

Delécluze hosted an influential Sunday salon at 1 rue Chabanais during the 1820s, drawing painters, writers, and musicians into his orbit. He was the maternal uncle of the architect Eugène Viollet-le-Duc and personally supervised his early education and training in drawing. He died in Versailles on 12 July 1863.[^3]

[^1]: Étienne-Jean Delécluze | Wikipedia (French) | license=CC BY-SA | url=https://fr.wikipedia.org/wiki/%C3%89tienne-Jean_Del%C3%A9cluze
[^2]: Étienne-Jean Delécluze | Wikipedia (English) | license=CC BY-SA | url=https://en.wikipedia.org/wiki/%C3%89tienne-Jean_Del%C3%A9cluze
[^3]: Étienne-Jean Delécluze (1781–1863) | data.bnf.fr (Bibliothèque nationale de France) | license=Open license / BnF | url=https://data.bnf.fr/12393802/etienne-jean_delecluze/
`,
      sources: [
        {
          url: "https://fr.wikipedia.org/wiki/%C3%89tienne-Jean_Del%C3%A9cluze",
          label: "Wikipedia (fr) — Étienne-Jean Delécluze",
          license: "CC BY-SA",
        },
        {
          url: "https://en.wikipedia.org/wiki/%C3%89tienne-Jean_Del%C3%A9cluze",
          label: "Wikipedia (en) — Étienne-Jean Delécluze",
          license: "CC BY-SA",
        },
        {
          url: "https://data.bnf.fr/12393802/etienne-jean_delecluze/",
          label: "data.bnf.fr — Étienne-Jean Delécluze (1781-1863)",
          license: "Open license / BnF",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/c/c8/Del%C3%A9cluze_portrait_par_Ingres.jpeg",
      attribution:
        "Jean-Auguste-Dominique Ingres, 1856 (pencil and white chalk drawing, Fogg Art Museum, Harvard Art Museums) — via Wikimedia Commons",
      license: "Public domain (CC-PD-Mark; artist died 1867)",
      title: "Portrait of Étienne-Jean Delécluze by Ingres (1856)",
    },
  },
  {
    slug: "silvestre-de-sacy",
    bio: {
      content: `# Samuel-Ustazade Silvestre de Sacy (1801–1879)

Samuel-Ustazade Silvestre de Sacy — his unusual middle name, Persian for "son of the master," nodded to his father, the celebrated orientalist Antoine-Isaac Silvestre de Sacy — was a literary critic, librarian, and senator who spent nearly half a century at the *Journal des Débats*. Born in Paris on 17 October 1801, he studied at the Collège Louis-le-Grand and trained as a lawyer, earning his license in 1820, before turning to journalism.[^1][^2]

At twenty-seven he joined the staff of the *Journal des Débats* in 1828, where he remained a contributor for the rest of his working life — close to fifty years. He wrote on politics during the July Monarchy and increasingly turned to literary criticism after the 1851 coup d'état, building a reputation as a measured, erudite reviewer of contemporary letters and classical scholarship alike.[^2]

Alongside journalism, Sacy pursued a parallel career in public institutions: he became a curator at the Bibliothèque Mazarine in 1836 and its administrator in 1848. In 1854 he was elected to the Académie française (seat 15, succeeding Antoine Jay), delivering his reception speech the following year. He was appointed to the Conseil supérieur de l'instruction publique in 1864 and named a senator of the Second Empire in December 1865, despite having built his career as a critic of the imperial regime.[^3]

## Personality

Colleagues remembered Sacy for his intellectual versatility, moving easily between journalism, librarianship, and academic life, and for the gravitas he brought to public ceremony — he delivered the Académie's funeral oration for Adolphe Thiers. He died in Paris on 14 February 1879 and was buried in Père-Lachaise Cemetery (Division 10).[^4]

[^1]: Ustazade Silvestre de Sacy | Wikipedia (English) | license=CC BY-SA | url=https://en.wikipedia.org/wiki/Ustazade_Silvestre_de_Sacy
[^2]: Ustazade Silvestre de Sacy | Wikipedia (French) | license=CC BY-SA | url=https://fr.wikipedia.org/wiki/Ustazade_Silvestre_de_Sacy
[^3]: Ustazade Silvestre de Sacy, fauteuil 15 | Académie française | license=Institutional source | url=https://www.academie-francaise.fr/les-immortels/ustazade-silvestre-de-sacy
[^4]: Ustazade Silvestre de Sacy (Q2341424) | Wikidata | license=CC0 | url=https://www.wikidata.org/wiki/Q2341424
`,
      sources: [
        {
          url: "https://en.wikipedia.org/wiki/Ustazade_Silvestre_de_Sacy",
          label: "Wikipedia (en) — Ustazade Silvestre de Sacy",
          license: "CC BY-SA",
        },
        {
          url: "https://fr.wikipedia.org/wiki/Ustazade_Silvestre_de_Sacy",
          label: "Wikipedia (fr) — Ustazade Silvestre de Sacy",
          license: "CC BY-SA",
        },
        {
          url: "https://www.academie-francaise.fr/les-immortels/ustazade-silvestre-de-sacy",
          label: "Académie française — Ustazade Silvestre de Sacy, fauteuil 15",
          license: "Institutional source",
        },
        {
          url: "https://www.wikidata.org/wiki/Q2341424",
          label: "Wikidata — Q2341424",
          license: "CC0",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/f/fa/Silvestre_de_Sacy%2C_Samuel_Ustazade%2C_Nadar%2C_Gallica.jpg",
      attribution:
        "Nadar (Gaspard-Félix Tournachon), photograph, c. 1870 — Bibliothèque nationale de France (Gallica) via Wikimedia Commons",
      license: "Public domain (CC0 1.0)",
      title: "Portrait photograph of Samuel-Ustazade Silvestre de Sacy by Nadar",
    },
  },
  {
    slug: "philarete-chasles",
    bio: {
      content: `# Philarète Chasles (1798–1873)

Victor Euphémion Philarète Chasles was a French literary critic, journalist, and one of the founding figures of comparative literature in France. Born on 6 October 1798 in Mainvilliers, Eure-et-Loir — son of a regicide member of the Convention — he spent his early adulthood in London as a printer's apprentice before returning to France in 1818, where he became secretary to the writer Étienne de Jouy.[^1]

During the 1844–46 period of Monte Cristo's serialization, Chasles was a regular feuilleton contributor to the *Journal des Débats*, where he had been attached since the late 1820s. His beat was foreign and especially English literature: he reviewed Charles Lamb (November 1842), wrote on Robert Wilson and English letters (May 1843), and published comparative studies such as a piece on Montaigne, Amyot, and Shakespeare (November 1846). He is widely credited with introducing English, German, Scandinavian, and Russian literature — including early notice of writers like Herman Melville and Jean Paul Richter — to French readers who had little access to it otherwise.[^2]

In 1837 he was appointed conservator of the Bibliothèque Mazarine, a post he held until his death, and in 1841 he became professor of comparative and Germanic/English literature at the Collège de France. His major critical work, the 20-volume *Études de littérature comparée* (1846–1875), grew out of decades of journalism and lectures; he later called the body of work *Trente ans de critique*. Contemporaries described him as brilliant but eccentric — a 19th-century review of his work noted his "extravagance of manner" alongside solid critical judgment. He died of cholera in Venice on 18 July 1873.[^1]

[^1]: Philarète Chasles | Wikipedia (English) | license=CC BY-SA | url=https://en.wikipedia.org/wiki/Philar%C3%A8te_Chasles
[^2]: Philarète Chasles | Wikipedia (French) | license=CC BY-SA | url=https://fr.wikipedia.org/wiki/Philar%C3%A8te_Chasles
`,
      sources: [
        {
          url: "https://en.wikipedia.org/wiki/Philar%C3%A8te_Chasles",
          label: "Wikipedia (en) — Philarète Chasles",
          license: "CC BY-SA",
        },
        {
          url: "https://fr.wikipedia.org/wiki/Philar%C3%A8te_Chasles",
          label: "Wikipedia (fr) — Philarète Chasles",
          license: "CC BY-SA",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/b/b5/Philar%C3%A8te_Chales_%28i.e._Chasles%29_-_btv1b531008049.jpg",
      attribution:
        "Atelier Nadar — Bibliothèque nationale de France, département Estampes et photographie (FT 4-NA-237), via Wikimedia Commons / Gallica",
      license: "Public domain",
      title: "Portrait photograph of Philarète Chasles, Atelier Nadar",
    },
  },
  {
    slug: "alfred-donne",
    bio: {
      content: `# Alfred Donné (1801–1878)

Alfred François Donné was a French physician, hematologist, and pioneer of medical microscopy. Born on 13 September 1801 in Noyon, Oise, he studied law before turning to medicine in Paris, defending his doctoral thesis in 1831 and becoming clinical chief at the Hôpital de la Charité in 1829.[^1][^2]

Donné contributed articles to the *Journal des Débats* from 1829 onward, and by the time of Monte Cristo's 1844–46 serialization he headed the paper's science section, where his student and laboratory assistant Léon Foucault worked alongside him. Donné had begun teaching a pioneering course on medical microscopy in 1837, at his own expense, at a time when the medical establishment was largely unconvinced the microscope had real diagnostic value. He pushed past that skepticism with original findings: he discovered *Trichomonas vaginalis* (1836), described the microscopic appearance of leukocytosis/leukemia, and in 1842 identified blood platelets.[^4]

His most lasting achievement came from combining microscopy with the new art of the daguerreotype. After Daguerre's 1839 announcement, Donné quickly adapted the process to capture microscopic images, presenting his first photomicrographs to the Académie des Sciences in February 1840. In 1844–45 he and Foucault published the *Cours de microscopie complémentaire des études médicales*, whose atlas volume held 20 plates engraved from 86 micro-daguerreotypes — among the first books in the history of medicine illustrated using photographic images. Donné later served as Inspector General of medical schools (1845) and rector of the academies of Strasbourg and Montpellier. He died in Paris on 7 March 1878.[^3]

[^1]: Alfred François Donné | Wikipedia (English) | license=CC BY-SA | url=https://en.wikipedia.org/wiki/Alfred_Fran%C3%A7ois_Donn%C3%A9
[^2]: Alfred Donné | Wikipedia (French) | license=CC BY-SA | url=https://fr.wikipedia.org/wiki/Alfred_Donn%C3%A9
[^3]: Donné Alfred Marie François — biographical dictionary | Persée / INRP | license=Open access | url=https://www.persee.fr/doc/inrp_0298-5632_2006_ant_12_2_4332
[^4]: Alfred François Donné, 1801–1878, discoverer of Trichomonas vaginalis and of leukaemia | PMC (PubMed Central) | license=Open access | url=https://pmc.ncbi.nlm.nih.gov/articles/PMC1045069/
`,
      sources: [
        {
          url: "https://en.wikipedia.org/wiki/Alfred_Fran%C3%A7ois_Donn%C3%A9",
          label: "Wikipedia (en) — Alfred François Donné",
          license: "CC BY-SA",
        },
        {
          url: "https://fr.wikipedia.org/wiki/Alfred_Donn%C3%A9",
          label: "Wikipedia (fr) — Alfred Donné",
          license: "CC BY-SA",
        },
        {
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1045069/",
          label: "PMC — Alfred François Donné, 1801-1878",
          license: "Open access",
        },
      ],
    },
    // No portrait: exhaustive search (Wikipedia EN/FR, Commons, data.bnf.fr, BIU Santé,
    // Gallica) turned up no verifiable image of Donné himself — only mislabeled or
    // uncaptioned results. Leaving unset rather than guessing.
  },
  {
    slug: "saint-marc-girardin",
    bio: {
      content: `# Saint-Marc Girardin (1801–1873)

Marc Girardin — who wrote under the name Saint-Marc Girardin — was one of the *Journal des Débats*'s leading political columnists and literary critics for nearly five decades. He began contributing to the paper around 1828 and became one of its principal voices after the July Revolution of 1830, writing on foreign policy, political doctrine, and literary criticism until he parted ways with the paper in 1872, the year before his death.[^1]

Alongside journalism, Girardin had a parallel career as an academic and politician. He taught at the Collège Henri-IV and Lycée Louis-le-Grand before becoming professor of French poetry, and later history, at the Sorbonne, succeeding François Guizot. He sat as a deputy for Saint-Yrieix (Haute-Vienne) across several periods between 1834 and 1873, served as a Master of Requests at the Council of State, and was briefly named to a ministerial post during the upheaval of February 1848. He was elected to the Académie française on 8 February 1844, occupying seat 23.[^3]

His best-known works include the multi-volume *Cours de littérature dramatique* (1843–1868), the early *Tableau de la littérature française au XVIe siècle* (1829), and a posthumously published study of *Jean-Jacques Rousseau* (1876). Contemporaries described him as a measured, scholarly Orléanist liberal who brought academic rigor to daily political commentary. He died on 11 April 1873 at Morsang-sur-Seine and was buried at Père-Lachaise; sources disagree on his exact birth date (12, 19, or 22 February 1801 are all cited), though all agree he was born in Paris.[^2]

[^1]: Saint-Marc Girardin | Wikipedia (French) | license=CC BY-SA | url=https://fr.wikipedia.org/wiki/Saint-Marc_Girardin
[^2]: Marc Girardin | Wikipedia (English) | license=CC BY-SA | url=https://en.wikipedia.org/wiki/Marc_Girardin
[^3]: Marc Girardin, dit Saint-Marc Girardin | Académie française | license=Institutional source | url=https://www.academie-francaise.fr/les-immortels/marc-girardin-dit-saint-marc-girardin
`,
      sources: [
        {
          url: "https://fr.wikipedia.org/wiki/Saint-Marc_Girardin",
          label: "Wikipedia (fr) — Saint-Marc Girardin",
          license: "CC BY-SA",
        },
        {
          url: "https://en.wikipedia.org/wiki/Marc_Girardin",
          label: "Wikipedia (en) — Marc Girardin",
          license: "CC BY-SA",
        },
        {
          url: "https://www.academie-francaise.fr/les-immortels/marc-girardin-dit-saint-marc-girardin",
          label: "Académie française — official biography",
          license: "Institutional source",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/b/b9/Saint-Marc_Girardin_par_Reutlinger.JPEG",
      attribution:
        "Charles Reutlinger (1816–1888), photographic portrait — Wikimedia Commons, via Bibliothèque nationale de France",
      license: "Public domain",
      title: "Saint-Marc Girardin, portrait photograph by Reutlinger",
    },
  },
  {
    slug: "john-lemoinne",
    bio: {
      content: `# John Lemoinne (1815–1892)

John Lemoinne was born in London on 17 October 1815 to a family of French émigrés, and died in Paris on 13 December 1892. He joined the *Journal des Débats* in 1840 and remained attached to it for roughly fifty years, building his reputation as the paper's correspondent and editorialist on English affairs and foreign policy more broadly. During the Second Empire, his columns repeatedly held up England's free political institutions as a contrast to Napoleon III's more authoritarian methods, though his admiration for England cooled later in life over colonial questions such as Egypt. He eventually rose to a senior editorial role at the paper.[^1]

He also wrote regularly for the *Revue des Deux Mondes* and published *Études critiques et biographiques* (1862), a collection of critical and biographical essays on literary and political figures of his day. In recognition of his standing as a journalist and man of letters, he was elected to the Académie française on 13 May 1875, taking seat 28 (previously held by Jules Janin), and was formally received on 2 March 1876.[^2]

Lemoinne capped his career with a political appointment: on 23 February 1880 he was elected a life senator by a unanimous vote of 142, sitting with the center-left. He briefly served as minister plenipotentiary to Brussels in spring 1880 before resigning the post within weeks to return to his journalistic and senatorial work. He is buried at Père-Lachaise Cemetery in Paris.[^1]

[^1]: John Lemoinne | Wikipedia (French) | license=CC BY-SA | url=https://fr.wikipedia.org/wiki/John_Lemoinne
[^2]: John Lemoinne | Wikipedia (English) | license=CC BY-SA | url=https://en.wikipedia.org/wiki/John_Lemoinne
`,
      sources: [
        {
          url: "https://fr.wikipedia.org/wiki/John_Lemoinne",
          label: "Wikipedia (fr) — John Lemoinne",
          license: "CC BY-SA",
        },
        {
          url: "https://en.wikipedia.org/wiki/John_Lemoinne",
          label: "Wikipedia (en) — John Lemoinne",
          license: "CC BY-SA",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/f/fd/J_Lemoinne.jpg",
      attribution:
        "Mlle Chevallier, engraving published in Le Magasin pittoresque (1894), digitized via Gallica/BnF (ark: bpt6k34968n/f92)",
      license: "Public domain",
      title: "John Lemoinne, engraved portrait",
    },
  },
  {
    slug: "michel-chevalier",
    bio: {
      content: `# Michel Chevalier (1806–1879)

Michel Chevalier was a French engineer, economist, and statesman, one of the leading champions of free trade in nineteenth-century Europe. Born 13 January 1806 in Limoges, he graduated top of his class from the École Polytechnique (1823) and trained as a mining engineer at the École des Mines (1825–1829).[^1]

In the early 1830s he embraced Saint-Simonian doctrine, editing the movement's journal *Le Globe* until it was suppressed in 1832. Arrested for "outraging public morality," he served roughly six months in the Sainte-Pélagie prison alongside Prosper Enfantin before being pardoned. From 1833 to 1835, sent by Interior Minister Adolphe Thiers to study industry and infrastructure in the United States and Mexico, he filed dispatches that ran as a 39-part series in the *Journal des Débats* (November 1833–October 1835), later collected as *Lettres sur l'Amérique du Nord* (1836). He remained a Débats contributor on economic affairs into the 1840s, alongside writing for the *Revue des Deux Mondes*; his 1837 book *Des intérêts matériels de la France* established his reputation as an economist.[^2]

He held the chair of political economy at the Collège de France from 1840 until his death, sat on the Conseil d'État (from 1838) and the Académie des sciences morales et politiques (from 1850), and served as a Second Empire senator (1860–1870). His crowning achievement was negotiating the 1860 Cobden-Chevalier Treaty with Richard Cobden, opening Anglo-French trade and triggering a wave of European tariff liberalization. He died 28 November 1879 near Lodève, Hérault, still defending free trade to the end.[^3]

[^1]: Michel Chevalier (homme politique) | Wikipedia (French) | license=CC BY-SA | url=https://fr.wikipedia.org/wiki/Michel_Chevalier_(homme_politique)
[^2]: Michel Chevalier | Wikipedia (English) | license=CC BY-SA | url=https://en.wikipedia.org/wiki/Michel_Chevalier
[^3]: Chevalier, Michel | 1911 Encyclopædia Britannica | license=Public domain | url=https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Chevalier,_Michel
`,
      sources: [
        {
          url: "https://fr.wikipedia.org/wiki/Michel_Chevalier_(homme_politique)",
          label: "Wikipedia (fr) — Michel Chevalier (homme politique)",
          license: "CC BY-SA",
        },
        {
          url: "https://en.wikipedia.org/wiki/Michel_Chevalier",
          label: "Wikipedia (en) — Michel Chevalier",
          license: "CC BY-SA",
        },
        {
          url: "https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Chevalier,_Michel",
          label: "1911 Britannica — Chevalier, Michel",
          license: "Public domain",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/c/cf/%28Michel_Chevalier%29_Truchelut_Truchelut_%2818_btv1b8450739q.jpg",
      attribution:
        "Jean-Nicolas Truchelut, photograph, 1879 — Bibliothèque nationale de France / Gallica (ark:/12148/btv1b8450739q), via Wikimedia Commons",
      license: "Public domain",
      title: "Michel Chevalier, cabinet-card portrait, 1879",
    },
  },
  {
    slug: "alfred-cuvillier-fleury",
    bio: {
      content: `# Alfred-Auguste Cuvillier-Fleury (1802–1887)

Alfred-Auguste Cuvillier-Fleury was a French literary critic, political columnist, and royal tutor. Born 18 March 1802 in Paris, he was a scholarship pupil at the Lycée Louis-le-Grand and won the rhetoric prize of honor at the 1819 Concours général. After a year as secretary to the exiled Louis Bonaparte in Florence and a stint supervising studies at the Collège Sainte-Barbe, his mentor recommended him to the Duke of Orléans (later King Louis-Philippe), who in 1827 entrusted him with educating his fourth son, Henri d'Orléans, duc d'Aumale.[^1][^2]

Cuvillier-Fleury tutored the young prince until 1839, then continued as his personal secretary, maintaining a warm, lifelong correspondence that later became an important historical source on the Orléans family. In 1834 he joined the *Journal des Débats*, where he wrote literary feuilletons and political columns for half a century, championing Lamartine, Chateaubriand, and Hugo from a classical, moralizing critical stance while defending the Orleanist political line; he dictated his last article in January 1885.[^2]

He was elected to the Académie française on 12 April 1866 (fauteuil 35, succeeding André-Marie Dupin) and formally received in 1867 by Désiré Nisard, who praised his blend of critical passion and courtesy.[^3] His books include *Portraits politiques et révolutionnaires* (1851), *Études historiques et littéraires* and *Voyages et voyageurs* (1854), and *Historiens, poètes et romanciers* (1863); his private *Journal intime* and correspondence with the Duc d'Aumale, published posthumously, remain valuable primary sources on nineteenth-century Orléanism. He died 18 October 1887 in Paris and was buried at Montmartre Cemetery.[^1]

[^1]: Alfred-Auguste Cuvillier-Fleury | Wikipedia (English) | license=CC BY-SA | url=https://en.wikipedia.org/wiki/Alfred-Auguste_Cuvillier-Fleury
[^2]: Alfred-Auguste Cuvillier-Fleury | Wikipedia (French) | license=CC BY-SA | url=https://fr.wikipedia.org/wiki/Alfred-Auguste_Cuvillier-Fleury
[^3]: Alfred-Auguste Cuvillier-Fleury, fauteuil 35 | Académie française | license=Institutional source | url=https://www.academie-francaise.fr/les-immortels/alfred-auguste-cuvillier-fleury
`,
      sources: [
        {
          url: "https://en.wikipedia.org/wiki/Alfred-Auguste_Cuvillier-Fleury",
          label: "Wikipedia (en) — Alfred-Auguste Cuvillier-Fleury",
          license: "CC BY-SA",
        },
        {
          url: "https://fr.wikipedia.org/wiki/Alfred-Auguste_Cuvillier-Fleury",
          label: "Wikipedia (fr) — Alfred-Auguste Cuvillier-Fleury",
          license: "CC BY-SA",
        },
        {
          url: "https://www.academie-francaise.fr/les-immortels/alfred-auguste-cuvillier-fleury",
          label: "Académie française — fauteuil 35",
          license: "Institutional source",
        },
      ],
    },
    portrait: {
      url: "https://upload.wikimedia.org/wikipedia/commons/0/03/Alfred-Auguste_Cuvillier-Fleury_by_Antoine-Samuel_Adam-Salomon%2C_1876-84.jpg",
      attribution:
        "Antoine-Samuel Adam-Salomon, photograph, c. 1876–84 — Philadelphia Museum of Art, via Wikimedia Commons",
      license: "Public domain",
      title: "Alfred-Auguste Cuvillier-Fleury, portrait photograph, c. 1876–84",
    },
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function r2KeyExists(key: string): Promise<boolean> {
  try {
    await R2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "MonteCristoExperience/1.0 (https://github.com/count-of-monte-cristo; contact@example.com) node-fetch",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function uploadText(key: string, text: string): Promise<void> {
  await R2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: Buffer.from(text, "utf-8"),
      ContentType: "text/markdown; charset=utf-8",
    }),
  );
}

async function uploadImage(
  key: string,
  buf: Buffer,
  contentType: string,
): Promise<void> {
  await R2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buf,
      ContentType: contentType,
    }),
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Downloads (or reuses) an image, registers it in media_assets, links it to the
 * person via asset_links, and sets the given column (portrait_media_asset_id /
 * background_media_asset_id) on the people row. Shared by portrait and
 * background processing below.
 */
async function processImageField(
  personId: string,
  slug: string,
  field: "portrait" | "background",
  image: { url: string; attribution: string; license: string; title: string },
): Promise<void> {
  const ext = image.url.split("?")[0].split(".").pop() ?? "jpg";
  const imageKey = `people/${slug}/${field}.${ext}`;
  let uploadedToR2 = false;

  if (!(await r2KeyExists(imageKey))) {
    try {
      const buf = await downloadBuffer(image.url);
      const ct = ext === "png" ? "image/png" : "image/jpeg";
      await uploadImage(imageKey, buf, ct);
      uploadedToR2 = true;
      console.log(`  ✓ ${field} uploaded: ${imageKey}`);
    } catch (e) {
      console.warn(
        `  ⚠ ${field} not downloadable (${(e as Error).message.slice(0, 60)}); will register with source_url as display fallback`,
      );
    }
  } else {
    uploadedToR2 = true;
    console.log(`  · ${field} already in R2`);
  }

  // Register in media_assets (with r2_key if we uploaded, otherwise download_blocked + source_url)
  const { data: existing } = await supabase
    .from("media_assets")
    .select("id")
    .eq("source_url", image.url)
    .maybeSingle();

  let mediaAssetId: string;
  if (existing) {
    mediaAssetId = existing.id;
  } else {
    const { data: inserted, error: iaErr } = await supabase
      .from("media_assets")
      .insert({
        kind: field,
        r2_key: uploadedToR2 ? imageKey : null,
        source_url: image.url,
        title: image.title,
        attribution: image.attribution,
        license: image.license,
        download_blocked: !uploadedToR2,
        download_blocked_reason: !uploadedToR2
          ? "Wikimedia Commons blocks server-side download"
          : null,
      })
      .select("id")
      .single();
    if (iaErr) {
      console.error(`  ✗ media_assets insert:`, iaErr.message);
      return;
    }
    mediaAssetId = inserted.id;
  }

  // Drop any stale links for this field (e.g. a previous run linked an older
  // image of the same kind) so the gallery/header never falls back to a
  // replaced portrait.
  const { data: staleLinks } = await supabase
    .from("asset_links")
    .select("media_asset_id, media_assets(kind)")
    .eq("target_type", "person")
    .eq("target_key", personId);
  const staleIds = (
    (staleLinks ?? []) as unknown as Array<{
      media_asset_id: string;
      media_assets: { kind: string } | null;
    }>
  )
    .filter((l) => l.media_assets?.kind === field && l.media_asset_id !== mediaAssetId)
    .map((l) => l.media_asset_id);
  if (staleIds.length > 0) {
    await supabase
      .from("asset_links")
      .delete()
      .eq("target_type", "person")
      .eq("target_key", personId)
      .in("media_asset_id", staleIds);
  }

  // Link to person via asset_links
  const { error: linkErr } = await supabase.from("asset_links").insert({
    target_type: "person",
    target_key: personId,
    media_asset_id: mediaAssetId,
    sort_order: 0,
  });
  if (
    linkErr &&
    !linkErr.message.includes("duplicate") &&
    !linkErr.message.includes("unique")
  ) {
    console.error(`  ✗ asset_links:`, linkErr.message);
  }

  // Set {field}_media_asset_id on people row
  await supabase
    .from("people")
    .update({ [`${field}_media_asset_id`]: mediaAssetId })
    .eq("id", personId);

  console.log(`  ✓ ${field} linked (${mediaAssetId}, r2=${uploadedToR2})`);
}

async function upload() {
  // Get slug → id map
  const { data: people } = await supabase.from("people").select("id, slug");
  const slugToId: Record<string, string> = {};
  for (const p of people ?? []) slugToId[p.slug] = p.id;

  for (const asset of ASSETS) {
    const personId = slugToId[asset.slug];
    if (!personId) {
      console.warn(`  ⚠ Person not found: ${asset.slug}`);
      continue;
    }
    console.log(`\nProcessing ${asset.slug}...`);

    // --- Bio markdown ---
    // Always re-uploaded (cheap PutObject) so edits to the bio text below land
    // on re-run; only the expensive image downloads are guarded by r2KeyExists.
    const bioKey = `people/${asset.slug}/bio.md`;
    await uploadText(bioKey, asset.bio.content);
    console.log(`  ✓ Bio uploaded: ${bioKey}`);
    const { error: bioUpdErr } = await supabase
      .from("people")
      .update({ bio_md_r2_key: bioKey })
      .eq("id", personId);
    if (bioUpdErr) console.error(`  ✗ bio_md_r2_key update:`, bioUpdErr.message);

    // --- Autobio markdown ---
    if (asset.autobio) {
      const autobioKey = `people/${asset.slug}/autobio.md`;
      await uploadText(autobioKey, asset.autobio.content);
      console.log(`  ✓ Autobio uploaded: ${autobioKey}`);
      const { error: autobioUpdErr } = await supabase
        .from("people")
        .update({ autobio_md_r2_key: autobioKey })
        .eq("id", personId);
      if (autobioUpdErr)
        console.error(`  ✗ autobio_md_r2_key update:`, autobioUpdErr.message);
    }

    // --- Portrait image ---
    if (asset.portrait) {
      await processImageField(personId, asset.slug, "portrait", asset.portrait);
    }

    // --- Background/backdrop image ---
    if (asset.background) {
      await processImageField(personId, asset.slug, "background", asset.background);
    }
  }

  console.log("\n✓ Upload complete.");
}

upload().catch((err) => {
  console.error(err);
  process.exit(1);
});
