"use client";

import { useMemo } from "react";
import styled from "styled-components";
import type { ResolvedTextItem } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import ContributorByline from "./ContributorByline";
import Cite, { type CiteSource } from "@/components/ui/Cite";
import { cleanGalignaniOcr } from "@/lib/galignani/clean-ocr";
import {
  structureGalignaniOcr,
  type GalignaniBlock,
} from "@/lib/galignani/structure-ocr";
import { ProseRubric, renderPublicDomainInline } from "@/lib/render-prose";
import { usePeopleLinkPlain } from "@/lib/people-linker";
import { ProseBlock } from "./TabPrimitives";

interface Props {
  item: ResolvedTextItem;
  contributors?: Map<string, ContributorInfo>;
  citeN?: number;
}

const Dateline = styled.p`
  font-family: var(--font-labels-stack);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
  text-align: center;
  margin: 0 0 1em;
`;

const AdLead = styled.p`
  font-family: var(--font-labels-stack);
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--ink-secondary);
  margin: 0 0 0.75em;
`;

const Quote = styled.blockquote`
  font-family: var(--font-body-stack);
  font-size: 16px;
  line-height: 1.65;
  color: var(--ink-secondary);
  margin: 0 0 1em;
  padding-left: 1em;
  border-left: 2px solid var(--rule-light);
`;

const Footer = styled.p`
  font-family: var(--font-labels-stack);
  font-size: 11px;
  color: var(--ink-muted);
  margin: 1.25em 0 0;
`;

const EmptyOcr = styled.p`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 15px;
  color: var(--ink-muted);
  margin: 0;
`;

function buildCiteSource(item: ResolvedTextItem): CiteSource {
  return {
    title: item.source ?? "Galignani's Messenger",
    attribution:
      item.attribution ??
      (item.original_date ? `Published ${item.original_date}` : ""),
    license: item.license,
    source_text_url: item.source_text_url ?? item.gallica_url,
    source_text_link_label: "View the original",
    translator: item.translator,
    translation_source_url: item.translation_source_url,
  };
}

function renderBlock(
  block: GalignaniBlock,
  index: number,
  renderInline: (text: string) => ReturnType<typeof renderPublicDomainInline>,
) {
  switch (block.type) {
    case "heading":
      return (
        <ProseRubric
          key={index}
          style={{ margin: index === 0 ? "0 0 0.75em" : "1.25em 0 0.75em" }}
        >
          {block.text}
        </ProseRubric>
      );
    case "dateline":
      return <Dateline key={index}>{block.text}</Dateline>;
    case "ad_lead":
      return <AdLead key={index}>{renderInline(block.text)}</AdLead>;
    case "blockquote":
      return <Quote key={index}>{renderInline(block.text)}</Quote>;
    case "footer":
      return <Footer key={index}>{block.text}</Footer>;
    case "paragraph":
    default:
      return <p key={index}>{renderInline(block.text)}</p>;
  }
}

export default function GalignaniOcrText({
  item,
  contributors,
  citeN = 1,
}: Props) {
  const linkPlain = usePeopleLinkPlain({ enabled: true });
  const renderInline = (text: string) =>
    renderPublicDomainInline(text, linkPlain);

  const blocks = useMemo(() => {
    const cleaned = cleanGalignaniOcr(item.text);
    return structureGalignaniOcr(cleaned);
  }, [item.text]);

  const contributor =
    item.contributor_id && contributors
      ? contributors.get(item.contributor_id) ?? null
      : null;

  const citeSource = buildCiteSource(item);

  return (
    <div>
      <ProseBlock>
        {blocks.length === 0 ? (
          <EmptyOcr>No readable OCR text on this page.</EmptyOcr>
        ) : (
          blocks.map((block, i) => renderBlock(block, i, renderInline))
        )}
      </ProseBlock>
      {contributor && <ContributorByline contributor={contributor} />}
      <span
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 2,
          marginTop: 6,
        }}
      >
        <Cite source={citeSource} n={citeN} />
      </span>
    </div>
  );
}
