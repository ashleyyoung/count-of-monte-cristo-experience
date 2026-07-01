"use client";

import styled from "styled-components";
import { useRouter, useSearchParams } from "next/navigation";

type PageTab = "translated" | "galignani";
type PageParamKey = "page" | "gpage";

interface Props {
  pageCount: number;
  activePage: number;
  tab?: PageTab;
  paramKey?: PageParamKey;
}

const TAB_LABELS: Record<PageTab, string> = {
  translated: "Translated paper pages",
  galignani: "Galignani OCR pages",
};

const Row = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px;
  margin-bottom: 8px;
  background: rgba(120, 84, 40, 0.05);
  border: 1px solid var(--rule-light);
`;

const SubTab = styled.button<{ $active: boolean }>`
  font-family: var(--font-body-stack);
  font-size: 14px;
  line-height: 1.3;
  padding: 7px 13px;
  background: ${({ $active }) => ($active ? "var(--paper-card)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--ink-primary)" : "var(--ink-muted)")};
  border: 1px solid
    ${({ $active }) => ($active ? "var(--gilt-warm)" : "var(--rule-light)")};
  cursor: pointer;
  white-space: nowrap;
  transition:
    background 0.15s,
    border-color 0.15s,
    color 0.15s;

  &:hover:not([aria-selected="true"]) {
    border-color: var(--rule-mid);
    color: var(--ink-secondary);
    background: rgba(239, 230, 207, 0.5);
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }
`;

export default function PaperPageSubTabRow({
  pageCount,
  activePage,
  tab = "translated",
  paramKey = tab === "galignani" ? "gpage" : "page",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleSelect(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.set(paramKey, String(page));
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  return (
    <Row role="tablist" aria-label={TAB_LABELS[tab]}>
      {Array.from({ length: pageCount }, (_, i) => {
        const page = i + 1;
        const active = page === activePage;
        return (
          <SubTab
            key={page}
            $active={active}
            role="tab"
            aria-selected={active}
            onClick={() => handleSelect(page)}
          >
            Page {page}
          </SubTab>
        );
      })}
    </Row>
  );
}
