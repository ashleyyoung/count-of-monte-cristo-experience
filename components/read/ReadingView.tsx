"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styled, { css } from "styled-components";
import {
  renderProseParagraphs,
  renderPublicDomainInline,
} from "@/lib/render-prose";
import { hasNarration } from "@/lib/narration";
import BreadcrumbBar from "@/components/ui/BreadcrumbBar";

interface ChapterRef {
  slug: string;
  num: string;
  title: string;
}

interface Props {
  chapterNum: string;
  chapterTitle: string;
  chapterIndex: number; // 0-based
  totalChapters: number;
  text: string | null;
  prevText: string | null;
  nextText: string | null;
  prev: ChapterRef | null;
  next: ChapterRef | null;
  prevPrev: ChapterRef | null;
  nextNext: ChapterRef | null;
  isSignedIn: boolean;
}

type TurnDir = "next" | "prev";

// How long the slide runs before we actually swap routes underneath it.
const TURN_MS = 470;

// Fixed height of the persistent masthead. The sliding page and the neighbour
// layers pad their tops by this so their article content lines up beneath it.
const MASTHEAD_H = 64;

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

// Clips the horizontal travel of the sliding page so it never produces a
// scrollbar; `clip` (unlike `hidden`) leaves vertical scrolling to the body.
const Stage = styled.div`
  position: relative;
  overflow-x: clip;
`;

// The live chapter. It sits above the neighbour layers and slides sideways to
// reveal them. Keyed by chapter so each navigation mounts a fresh sheet at
// rest — no reverse-slide when the route catches up.
const Page = styled.main<{ $active: boolean; $dir: TurnDir | null }>`
  position: relative;
  z-index: 1;
  background: var(--paper-base);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${MASTHEAD_H}px 24px 96px;
  transition: transform ${TURN_MS}ms cubic-bezier(0.7, 0, 0.18, 1);

  ${({ $active, $dir }) =>
    $active &&
    css`
      transform: translateX(${$dir === "prev" ? "100%" : "-100%"});
      box-shadow: ${$dir === "prev" ? "-28px" : "28px"} 0 48px -16px
        rgba(40, 30, 18, 0.45);
    `}

  @media (max-width: 700px) {
    padding: ${MASTHEAD_H}px 18px 72px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// A neighbour chapter pinned to the viewport, behind the live page. Only the
// top viewport-worth shows through as the page slides away.
const UnderLayer = styled.div<{ $show: boolean }>`
  position: fixed;
  inset: 0;
  z-index: 0;
  background: var(--paper-base);
  display: ${({ $show }) => ($show ? "flex" : "none")};
  flex-direction: column;
  align-items: center;
  padding: ${MASTHEAD_H}px 24px 96px;
  overflow: hidden;
  pointer-events: none;

  @media (max-width: 700px) {
    padding: ${MASTHEAD_H}px 18px 72px;
  }
`;

// One persistent masthead for the whole reading view. It lives outside the
// sliding layers and never remounts, so it holds rock-steady through a turn.
const Masthead = styled.header`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  height: ${MASTHEAD_H}px;
  background: var(--paper-base);
  border-bottom: 1px solid var(--rule-light);
  display: flex;
  justify-content: center;
`;

const MastheadInner = styled.div`
  width: 100%;
  max-width: 720px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;

  @media (max-width: 700px) {
    padding: 0 18px;
  }
`;

const Crumbs = styled.div`
  min-width: 0;
`;

const TopLinks = styled.div`
  display: flex;
  gap: 18px;
  align-items: center;
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

const Article = styled.article`
  width: 100%;
  max-width: 640px;
  padding-top: 18px;
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
  font-size: clamp(30px, 4.5vw, 46px);
  color: var(--ink-primary);
  line-height: 1.05;
  margin: 0 0 36px;
`;

const Prose = styled.div`
  font-family: var(--font-body-stack);
  font-size: 18px;
  line-height: 1.72;
  color: var(--ink-secondary);

  p + p {
    margin-top: 1em;
  }
  p {
    margin: 0;
  }
`;

const Missing = styled.p`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 16px;
  color: var(--ink-muted);
`;

/** Chapter navigation row: previous · page count · next.
 *  Shared by the top of the chapter and the foot of the page. */
const NavRow = styled.nav`
  width: 100%;
  max-width: 640px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
`;

/** Top placement — sits just under the masthead divider. */
const TopNav = styled(NavRow)`
  margin: 0 0 32px;
`;

/** Foot placement — divider rule above, at the end of the chapter. */
const FootNav = styled(NavRow)`
  margin-top: 64px;
  padding-top: 28px;
  border-top: 1px solid var(--rule-light);
`;

const PrevLink = styled(Link)`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--ink-muted);
  text-decoration: none;

  &:hover {
    color: var(--ink-primary);
  }
`;

const Counter = styled.span`
  font-family: var(--font-supporting-stack);
  font-style: italic;
  font-size: 17px;
  letter-spacing: 0.04em;
  color: var(--ink-tertiary);
  white-space: nowrap;
`;

// ---------------------------------------------------------------------------
// Chapter body — shared by the live page and the neighbour under-layers so
// their layout matches exactly, making the hand-off after a turn seamless.
// ---------------------------------------------------------------------------

interface ChapterBodyProps {
  chapterNum: string;
  chapterTitle: string;
  chapterIndex: number;
  totalChapters: number;
  text: string | null;
  prev: ChapterRef | null;
  next: ChapterRef | null;
  onNavigate?: (e: MouseEvent, slug: string, dir: TurnDir) => void;
}

function ChapterBody({
  chapterNum,
  chapterTitle,
  chapterIndex,
  totalChapters,
  text,
  prev,
  next,
  onNavigate,
}: ChapterBodyProps) {
  const navRow = (
    <>
      {prev ? (
        <PrevLink
          href={`/read/${prev.slug}`}
          onClick={
            onNavigate ? (e) => onNavigate(e, prev.slug, "prev") : undefined
          }
        >
          ← {prev.num}. {prev.title}
        </PrevLink>
      ) : (
        <span />
      )}
      <Counter>
        {chapterIndex + 1} / {totalChapters}
      </Counter>
      {next ? (
        <PrevLink
          href={`/read/${next.slug}`}
          onClick={
            onNavigate ? (e) => onNavigate(e, next.slug, "next") : undefined
          }
        >
          {next.num}. {next.title} →
        </PrevLink>
      ) : (
        <span />
      )}
    </>
  );

  return (
    <>
      <Article>
        <TopNav>{navRow}</TopNav>

        <Kicker>Chapter {chapterNum}</Kicker>
        <Title>{chapterTitle}</Title>

        {text ? (
          <Prose>{renderProseParagraphs(text, renderPublicDomainInline)}</Prose>
        ) : (
          <Missing>This chapter&rsquo;s text is not yet available.</Missing>
        )}
      </Article>

      <FootNav>{navRow}</FootNav>
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ReadingView({
  chapterNum,
  chapterTitle,
  chapterIndex,
  totalChapters,
  text,
  prevText,
  nextText,
  prev,
  next,
  prevPrev,
  nextNext,
  isSignedIn,
}: Props) {
  const router = useRouter();
  // The turn we kicked off, tagged with the chapter it started from. Once the
  // route advances past `from`, the turn no longer applies to the rendered
  // page, so it falls back to rest without a reverse animation.
  const [turn, setTurn] = useState<{ dir: TurnDir; from: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = turn !== null && turn.from === chapterNum;
  const dir = active ? turn!.dir : null;

  // Prefetch neighbours so the route swap behind the slide is instant.
  useEffect(() => {
    if (prev) router.prefetch(`/read/${prev.slug}`);
    if (next) router.prefetch(`/read/${next.slug}`);
  }, [prev, next, router]);

  // Clear the turn once navigation lands on a new chapter.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    setTurn(null);
  }, [chapterNum]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function handleNavigate(e: MouseEvent, slug: string, navDir: TurnDir) {
    // Let modified clicks (new tab, etc.) behave normally.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (active) return; // a turn is already in flight

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      router.push(`/read/${slug}`);
      return;
    }

    setTurn({ dir: navDir, from: chapterNum });
    timer.current = setTimeout(() => router.push(`/read/${slug}`), TURN_MS);
  }

  // Persist reading position to the user's account (resume target for /read).
  useEffect(() => {
    if (!isSignedIn) return;
    void fetch("/api/book-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readChapter: chapterNum }),
      keepalive: true,
    }).catch(() => {});
  }, [chapterNum, isSignedIn]);

  const currentRef: ChapterRef = {
    slug: chapterNum.toLowerCase(),
    num: chapterNum,
    title: chapterTitle,
  };

  const listenHref = hasNarration(chapterNum)
    ? `/listen?chapter=${chapterNum}`
    : "/listen";

  return (
    <Stage>
      {/* Persistent masthead — sits above the slide and never moves. */}
      <Masthead>
        <MastheadInner>
          <Crumbs>
            <BreadcrumbBar
              crumbs={[
                { label: "Le Comte de Monte-Cristo", href: "/" },
                { label: "Table of Contents", href: "/read" },
                { label: `Ch. ${chapterNum}` },
              ]}
            />
          </Crumbs>
          <TopLinks>
            <TopLink href={listenHref}>Listen ♪</TopLink>
          </TopLinks>
        </MastheadInner>
      </Masthead>

      {/* Neighbour chapters, revealed beneath the live page during a turn. */}
      {next && (
        <UnderLayer $show={dir === "next"} aria-hidden>
          <ChapterBody
            chapterNum={next.num}
            chapterTitle={next.title}
            chapterIndex={chapterIndex + 1}
            totalChapters={totalChapters}
            text={nextText}
            prev={currentRef}
            next={nextNext}
          />
        </UnderLayer>
      )}
      {prev && (
        <UnderLayer $show={dir === "prev"} aria-hidden>
          <ChapterBody
            chapterNum={prev.num}
            chapterTitle={prev.title}
            chapterIndex={chapterIndex - 1}
            totalChapters={totalChapters}
            text={prevText}
            prev={prevPrev}
            next={currentRef}
          />
        </UnderLayer>
      )}

      <Page key={chapterNum} $active={active} $dir={dir}>
        <ChapterBody
          chapterNum={chapterNum}
          chapterTitle={chapterTitle}
          chapterIndex={chapterIndex}
          totalChapters={totalChapters}
          text={text}
          prev={prev}
          next={next}
          onNavigate={handleNavigate}
        />
      </Page>
    </Stage>
  );
}
