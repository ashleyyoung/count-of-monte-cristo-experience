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
 * it skips any person whose bio_r2_key is already set.
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
}

const ASSETS: AssetDef[] = [
  {
    slug: "jules-janin",
    bio: {
      content: `# Jules Janin (1804–1874)

Jules Gabriel Janin was one of the most celebrated French critics of the nineteenth century, famed for his weekly theatre feuilleton in the *Journal des Débats*. Born in Saint-Étienne on 16 February 1804, he studied in Paris and quickly joined the Débats as its principal dramatic critic around 1827.

His Monday column — dubbed the "prince of critics" by contemporaries — was the most-read theatre review in Paris for nearly fifty years. Witty, impressionistic, and deeply personal, Janin's prose style influenced a generation of French journalism.

Beyond criticism Janin wrote novels (including *L'Âne mort et la femme guillotinée*, 1829) and belles-lettres, and in 1870 he was elected to the Académie française. He died in Passy on 19 June 1874.

## Personality

Janin was known for his warmth and generosity toward young writers, his love of paradox, and his instinct for the theatrical phrase. He was a fixture of literary salons and cultivated friendships with Hector Berlioz and Alexandre Dumas.

## Sources
- 1911 *Encyclopædia Britannica*, [Janin, Jules Gabriel](https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Janin,_Jules_Gabriel) (Public domain)
- Wikipedia (fr), [Jules Janin](https://fr.wikipedia.org/wiki/Jules_Janin) (CC BY-SA)
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
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Jules_Janin_by_Nadar.jpg/640px-Jules_Janin_by_Nadar.jpg",
      attribution:
        "Nadar (Gaspard-Félix Tournachon), c. 1855 — Wikimedia Commons",
      license: "Public domain",
      title: "Jules Janin photographed by Nadar",
    },
  },
  {
    slug: "hector-berlioz",
    bio: {
      content: `# Hector Berlioz (1803–1869)

Louis-Hector Berlioz was a French Romantic composer, conductor, and music critic, one of the dominant figures of nineteenth-century music. Born on 11 December 1803 in La Côte-Saint-André, Isère, he studied medicine briefly before abandoning it for the Paris Conservatoire.

His *Symphonie fantastique* (1830) inaugurated the programmatic symphony and secured his reputation. He became music critic for the *Journal des Débats* around 1835, a post he held for nearly thirty years; his feuilletons are models of French critical prose and invaluable documents of Parisian musical life.

During the Monte Cristo serialization (1844–46) Berlioz was reviewing opera, concerts, and musical events for the Débats weekly, often appearing on the same page as Dumas's feuilleton.

## Major works
- *Symphonie fantastique*, Op. 14 (1830)
- *Harold en Italie*, Op. 16 (1834)
- *Roméo et Juliette*, Op. 17 (1839)
- *Les Troyens* (1856–58, premiered 1863)
- *Mémoires* (published posthumously, 1870)

## Sources
- 1911 *Encyclopædia Britannica*, [Berlioz, Louis Hector](https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Berlioz,_Louis_Hector) (Public domain)
- The Hector Berlioz Website, [hberlioz.com](https://hberlioz.com/)
- IMSLP, [Symphonie fantastique](https://imslp.org/wiki/Symphonie_fantastique,_Op.14_(Berlioz,_Hector))
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
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Berlioz_crop.jpg/640px-Berlioz_crop.jpg",
      attribution: "Gustave Courbet (attrib.), c. 1850 — Wikimedia Commons",
      license: "Public domain",
      title: "Portrait of Hector Berlioz",
    },
  },
  {
    slug: "leon-foucault",
    bio: {
      content: `# Léon Foucault (1819–1868)

Jean Bernard Léon Foucault was a French physicist best known for his pendulum demonstration of Earth's rotation (1851) and for the invention of the gyroscope (1852). Born in Paris on 18 September 1819, he initially studied medicine but abandoned it for experimental physics.

During the 1844–46 period of Monte Cristo's serialization, Foucault was an assistant to Alfred Donné in the *Journal des Débats* science section, helping write notes on scientific developments and co-authoring with Donné the pioneering *Cours de microscopie* (1845), the first book illustrated with daguerreotypes.

His later career was one of the most productive in nineteenth-century physics. He demonstrated Earth's rotation with his famous pendulum at the Panthéon in January 1851, invented the gyroscope in 1852, and in 1862 measured the speed of light with a rotating mirror.

## Key discoveries (timeline)
- 1845 — *Cours de microscopie* (with Donné): first book with daguerreotype illustrations
- 1851 — Foucault's pendulum: Earth's rotation demonstrated publicly at the Panthéon
- 1852 — Gyroscope invented
- 1862 — Speed-of-light measurement with rotating mirror

## Sources
- 1911 *Encyclopædia Britannica*, [Foucault, Jean Bernard Léon](https://en.wikisource.org/wiki/1911_Encyclop%C3%A6dia_Britannica/Foucault,_Jean_Bernard_L%C3%A9on) (Public domain)
- Gallica, [Comptes rendus de l'Académie des sciences](https://gallica.bnf.fr/) (Public domain)
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
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/L%C3%A9on_Foucault.jpg/640px-L%C3%A9on_Foucault.jpg",
      attribution: "Unknown photographer, c. 1860 — Wikimedia Commons",
      license: "Public domain",
      title: "Portrait of Léon Foucault",
    },
  },
  {
    slug: "armand-bertin",
    bio: {
      content: `# Armand Bertin (1801–1854)

Armand Bertin was the director of the *Journal des Débats* during its most influential period, from 1834 until his death in 1854. Son of Louis-François Bertin (*Bertin l'aîné*, 1766–1841), who had rescued the paper during the Consulate, Armand brought it to the height of its cultural prestige.

Under Armand Bertin's direction the Débats published: feuilletons by Jules Janin, music criticism by Hector Berlioz, art criticism by Étienne-Jean Delécluze, and — crucially — the complete serialization of Alexandre Dumas's *Le Comte de Monte-Cristo* from 28 August 1844 to 15 January 1846.

Bertin was also a notable collector and patron; Ingres painted his celebrated portrait (now in the Louvre) in 1832.

## Sources
- Wikipedia (fr), [Armand Bertin](https://fr.wikipedia.org/wiki/Armand_Bertin) (CC BY-SA)
- data.bnf.fr, [Armand Bertin](https://data.bnf.fr/fr/11891163/armand_bertin/) (Public domain)
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
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Ingres_portrait_de_Louis-Fran%C3%A7ois_Bertin.jpg/640px-Ingres_portrait_de_Louis-Fran%C3%A7ois_Bertin.jpg",
      attribution:
        'Jean-Auguste-Dominique Ingres, Portrait de Louis-François Bertin ("Bertin l\'aîné"), 1832 — Musée du Louvre / Wikimedia Commons',
      license: "Public domain",
      title: "Bertin l'aîné by Ingres (father of Armand)",
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
    const bioKey = `people/${asset.slug}/bio.md`;
    if (!(await r2KeyExists(bioKey))) {
      await uploadText(bioKey, asset.bio.content);
      console.log(`  ✓ Bio uploaded: ${bioKey}`);
    } else {
      console.log(`  · Bio already in R2`);
    }
    await supabase
      .from("people")
      .update({ bio_r2_key: bioKey })
      .eq("id", personId);

    // --- Autobio markdown ---
    if (asset.autobio) {
      const autobioKey = `people/${asset.slug}/autobio.md`;
      if (!(await r2KeyExists(autobioKey))) {
        await uploadText(autobioKey, asset.autobio.content);
        console.log(`  ✓ Autobio uploaded: ${autobioKey}`);
      } else {
        console.log(`  · Autobio already in R2`);
      }
      await supabase
        .from("people")
        .update({ autobio_r2_key: autobioKey })
        .eq("id", personId);
    }

    // --- Portrait image ---
    if (asset.portrait) {
      const ext = asset.portrait.url.split("?")[0].split(".").pop() ?? "jpg";
      const portraitKey = `people/${asset.slug}/portrait.${ext}`;
      let uploadedToR2 = false;

      if (!(await r2KeyExists(portraitKey))) {
        try {
          const buf = await downloadBuffer(asset.portrait.url);
          const ct = ext === "png" ? "image/png" : "image/jpeg";
          await uploadImage(portraitKey, buf, ct);
          uploadedToR2 = true;
          console.log(`  ✓ Portrait uploaded: ${portraitKey}`);
        } catch (e) {
          console.warn(
            `  ⚠ Portrait not downloadable (${(e as Error).message.slice(0, 60)}); will register with source_url as display fallback`,
          );
        }
      } else {
        uploadedToR2 = true;
        console.log(`  · Portrait already in R2`);
      }

      // Register in media_assets (with r2_key if we uploaded, otherwise download_blocked + source_url)
      const { data: existing } = await supabase
        .from("media_assets")
        .select("id")
        .eq("source_url", asset.portrait.url)
        .maybeSingle();

      let mediaAssetId: string;
      if (existing) {
        mediaAssetId = existing.id;
      } else {
        const { data: inserted, error: iaErr } = await supabase
          .from("media_assets")
          .insert({
            kind: "portrait",
            r2_key: uploadedToR2 ? portraitKey : null,
            source_url: asset.portrait.url,
            title: asset.portrait.title,
            attribution: asset.portrait.attribution,
            license: asset.portrait.license,
            download_blocked: !uploadedToR2,
            download_blocked_reason: !uploadedToR2
              ? "Wikimedia Commons blocks server-side download"
              : null,
          })
          .select("id")
          .single();
        if (iaErr) {
          console.error(`  ✗ media_assets insert:`, iaErr.message);
          continue;
        }
        mediaAssetId = inserted.id;
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

      // Set portrait_media_asset_id on people row
      await supabase
        .from("people")
        .update({ portrait_media_asset_id: mediaAssetId })
        .eq("id", personId);

      console.log(`  ✓ Portrait linked (${mediaAssetId}, r2=${uploadedToR2})`);
    }
  }

  console.log("\n✓ Upload complete.");
}

upload().catch((err) => {
  console.error(err);
  process.exit(1);
});
