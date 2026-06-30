"use client";

import Link from "next/link";
import styled from "styled-components";
import BreadcrumbBar from "@/components/ui/BreadcrumbBar";
import type { BookChapter } from "@/lib/book";

interface Props {
  chapters: BookChapter[];
  lastReadChapter: string | null; // Roman numeral, or null
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Page = styled.main`
  background: var(--paper-base);
  min-height: 100vh;
`;

const Inner = styled.div`
  max-width: 760px;
  margin: 0 auto;
  padding: 0 24px 120px;

  @media (max-width: 700px) {
    padding: 0 16px 96px;
  }
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 0 24px;
  border-bottom: 1px solid var(--rule-light);
`;

const TopLink = styled(Link)`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  text-decoration: none;

  &:hover {
    color: var(--gilt-deep);
  }
`;

const Heading = styled.header`
  padding: 40px 0 28px;
`;

const Kicker = styled.p`
  font-family: var(--font-display-stack);
  font-style: italic;
  font-size: 13px;
  color: var(--gilt-warm);
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 0 0 10px;
`;

const Title = styled.h1`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: clamp(32px, 5vw, 52px);
  color: var(--ink-primary);
  line-height: 1.04;
  margin: 0 0 12px;
`;

const Sub = styled.p`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 15px;
  color: var(--ink-muted);
  margin: 0;
`;

const Resume = styled(Link)`
  display: inline-block;
  margin-top: 24px;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 15px;
  padding: 14px 24px;
  background: var(--gilt-warm);
  color: var(--ink-primary);
  text-decoration: none;
  border: 1px solid var(--gilt-warm);
  letter-spacing: 0.04em;
  transition:
    background 0.15s,
    border-color 0.15s;

  &:hover {
    background: var(--gilt-deep);
    border-color: var(--gilt-deep);
  }
`;

const List = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const Row = styled(Link)<{ $active: boolean }>`
  display: flex;
  align-items: baseline;
  gap: 16px;
  padding: 14px 14px;
  text-decoration: none;
  border-bottom: 1px solid var(--rule-light);
  background: ${({ $active }) =>
    $active ? "rgba(201, 162, 75, 0.10)" : "transparent"};
  transition: background 0.12s;

  &:hover {
    background: ${({ $active }) =>
      $active ? "rgba(201, 162, 75, 0.14)" : "var(--paper-card)"};
  }
`;

const RowNum = styled.span<{ $active: boolean }>`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 11px;
  min-width: 54px;
  flex-shrink: 0;
  letter-spacing: 0.04em;
  color: ${({ $active }) => ($active ? "var(--gilt-deep)" : "var(--ink-muted)")};
`;

const RowTitle = styled.span<{ $active: boolean }>`
  flex: 1;
  min-width: 0;
  font-family: var(--font-body-stack);
  font-size: 17px;
  color: ${({ $active }) =>
    $active ? "var(--ink-primary)" : "var(--ink-secondary)"};
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
`;

const RowResume = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--gilt-deep);
  flex-shrink: 0;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChaptersIndex({ chapters, lastReadChapter }: Props) {
  const resume = lastReadChapter
    ? chapters.find((c) => c.num === lastReadChapter)
    : undefined;

  return (
    <Page>
      <Inner>
        <TopBar>
          <BreadcrumbBar
            crumbs={[
              { label: "Le Comte de Monte-Cristo", href: "/" },
              { label: "Table of Contents" },
            ]}
          />
          <TopLink href="/listen">Listen ♪</TopLink>
        </TopBar>

        <Heading>
          <Kicker>The Novel</Kicker>
          <Title>Table of Contents</Title>
          <Sub>{chapters.length} chapters · read end to end</Sub>
          {resume && (
            <div>
              <Resume href={`/read/${resume.slug}`}>
                Continue reading — {resume.num}. {resume.title} →
              </Resume>
            </div>
          )}
        </Heading>

        <List>
          {chapters.map((ch) => {
            const active = ch.num === lastReadChapter;
            return (
              <li key={ch.slug}>
                <Row href={`/read/${ch.slug}`} $active={active}>
                  <RowNum $active={active}>{ch.num}</RowNum>
                  <RowTitle $active={active}>{ch.title}</RowTitle>
                  {active && <RowResume>last read</RowResume>}
                </Row>
              </li>
            );
          })}
        </List>
      </Inner>
    </Page>
  );
}
