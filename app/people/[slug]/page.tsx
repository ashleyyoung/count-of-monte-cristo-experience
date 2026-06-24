import { notFound } from "next/navigation";
import { getPersonPageData, getPersonAssets, getEgoGraph } from "@/lib/people";
import { resolveMediaUrl } from "@/lib/media";
import type { PortraitAsset } from "@/components/people/PortraitGallery";
import ProfilePageView from "@/components/people/ProfilePageView";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function PersonPage({ params }: Props) {
  const { slug } = await params;

  const person = await getPersonPageData(slug);
  if (!person) notFound();

  const [assetRows, egoGraph] = await Promise.all([
    getPersonAssets(person.id),
    getEgoGraph(person.id),
  ]);

  // Resolve R2/CDN URLs for each portrait asset
  const portraitAssets: PortraitAsset[] = assetRows.map((a) => ({
    id: a.id,
    r2_url: a.r2_key
      ? resolveMediaUrl({
          id: a.id,
          r2_key: a.r2_key,
          source_url: a.source_url,
          download_blocked: false,
          download_blocked_reason: null,
        })
      : null,
    source_url: a.source_url,
    title: a.title,
    attribution: a.attribution,
    license: a.license,
    kind: a.kind,
  }));

  return (
    <ProfilePageView
      person={person}
      portraitAssets={portraitAssets}
      egoGraph={egoGraph}
    />
  );
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const person = await getPersonPageData(slug);
  if (!person) return {};
  return {
    title: `${person.name} · Monte Cristo Experience`,
    description: `Profile of ${person.name} — contributor to the Journal des Débats during the serialization of The Count of Monte Cristo.`,
  };
}
