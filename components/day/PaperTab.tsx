"use client";

/**
 * "The paper" — the real Journal des Débats issue, in two languages behind one
 * toggle: French (the Gallica page scans, where the day's chapter ran as the
 * feuilleton at the foot of page 1) and English (the verbatim per-page
 * translation). Not side-by-side — a single switch.
 *
 * Composes the existing OriginalPaperTab (scans) and TranslatedPaperTab
 * (per-page translation) rather than reimplementing either.
 */

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styled from "styled-components";
import type { DayPageData } from "@/lib/content";
import type { ContributorInfo } from "./ContributorByline";
import OriginalPaperTab from "./OriginalPaperTab";
import TranslatedPaperTab from "./TranslatedPaperTab";

export type PaperLang = "fr" | "en";

interface Props {
  data: DayPageData;
  contributors: Map<string, ContributorInfo>;
  /** Language to show when the URL has no explicit `lang` (legacy tab links). */
  defaultLang: PaperLang;
}

const Frame = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const TopRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
`;

const Framing = styled.p`
  font-family: var(--font-body-stack);
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-muted);
  max-width: 560px;
  margin: 0;
`;

const Toggle = styled.div`
  display: inline-flex;
  border: 1px solid var(--rule-mid);
  border-radius: 3px;
  overflow: hidden;
  flex-shrink: 0;
`;

const ToggleBtn = styled.button<{ $active: boolean }>`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  letter-spacing: 0.04em;
  padding: 7px 16px;
  border: none;
  cursor: pointer;
  background: ${({ $active }) => ($active ? "var(--gilt-warm)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--ink-primary)" : "var(--ink-muted)")};
  transition: background 0.15s, color 0.15s;

  & + & {
    border-left: 1px solid var(--rule-mid);
  }

  &:hover:not(:disabled) {
    color: var(--ink-primary);
  }
`;

export default function PaperTab({ data, contributors, defaultLang }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const raw = searchParams.get("lang");
  const lang: PaperLang = raw === "fr" || raw === "en" ? raw : defaultLang;

  const setLang = useCallback(
    (next: PaperLang) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", "paper");
      params.set("lang", next);
      // Page sub-tabs only apply to the English per-page reader.
      if (next === "fr") params.delete("page");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <Frame>
      <TopRow>
        <Framing>
          The morning&rsquo;s <em>Journal des Débats</em>. The chapter you are
          reading ran as the <em>feuilleton</em> along the foot of page one — the
          serialized fiction that sold the paper.
        </Framing>
        <Toggle role="tablist" aria-label="Paper language">
          <ToggleBtn
            role="tab"
            aria-selected={lang === "fr"}
            $active={lang === "fr"}
            onClick={() => setLang("fr")}
          >
            French (original)
          </ToggleBtn>
          <ToggleBtn
            role="tab"
            aria-selected={lang === "en"}
            $active={lang === "en"}
            onClick={() => setLang("en")}
          >
            English
          </ToggleBtn>
        </Toggle>
      </TopRow>

      {lang === "fr" ? (
        <OriginalPaperTab data={data} />
      ) : (
        <TranslatedPaperTab data={data} contributors={contributors} />
      )}
    </Frame>
  );
}
