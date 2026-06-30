"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import styled, { keyframes, css } from "styled-components";
import BreadcrumbBar from "@/components/ui/BreadcrumbBar";
import type { BookChapter } from "@/lib/book";
import {
  type NarrationLang,
  getNarrationUrl,
  NARRATION_NARRATOR,
  NARRATION_LICENSE,
  NARRATION_LICENSE_URL,
} from "@/lib/narration";

interface Props {
  chapters: BookChapter[];
  startChapter: string; // Roman numeral
  startPosition: number; // seconds
  startLang: NarrationLang;
  isSignedIn: boolean;
}

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
type Speed = (typeof SPEEDS)[number];

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const eqBounce = keyframes`
  0%, 100% { transform: scaleY(0.25); }
  50%      { transform: scaleY(1); }
`;

const Page = styled.main`
  background: var(--paper-base);
  min-height: 100vh;
`;

const Inner = styled.div`
  max-width: 760px;
  margin: 0 auto;
  padding: 0 24px 140px;

  @media (max-width: 700px) {
    padding: 0 16px 160px;
  }
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22px 0 24px;
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
  padding: 8px 0 24px;
  border-bottom: 1px solid var(--rule-light);
`;

const Kicker = styled.p`
  font-family: var(--font-display-stack);
  font-style: italic;
  font-size: 13px;
  color: var(--gilt-warm);
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 0 0 8px;
`;

const Title = styled.h1`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: clamp(28px, 4vw, 40px);
  color: var(--ink-primary);
  line-height: 1.05;
  margin: 0 0 8px;
`;

const Sub = styled.p`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 14px;
  color: var(--ink-muted);
  margin: 0;
`;

// --- Playlist ---

const List = styled.ol`
  list-style: none;
  margin: 0;
  padding: 12px 0 0;
`;

const Row = styled.li<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  cursor: pointer;
  border-bottom: 1px solid var(--rule-light);
  background: ${({ $active }) =>
    $active ? "rgba(201,162,75,0.10)" : "transparent"};
  transition: background 0.12s;

  &:hover {
    background: ${({ $active }) =>
      $active ? "rgba(201,162,75,0.14)" : "var(--paper-card)"};
  }
`;

const RowNum = styled.span<{ $active: boolean }>`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 11px;
  min-width: 44px;
  color: ${({ $active }) => ($active ? "var(--gilt-deep)" : "var(--ink-muted)")};
  letter-spacing: 0.04em;
`;

const RowTitle = styled.span<{ $active: boolean }>`
  flex: 1;
  min-width: 0;
  font-family: var(--font-body-stack);
  font-size: 16px;
  color: ${({ $active }) =>
    $active ? "var(--ink-primary)" : "var(--ink-secondary)"};
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
`;

const EqBars = styled.span`
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 13px;
  flex-shrink: 0;
`;

const EqBar = styled.span<{
  $playing: boolean;
  $reducedMotion: boolean;
  $delay: number;
}>`
  display: block;
  width: 3px;
  height: 13px;
  background: var(--gilt-warm);
  transform-origin: bottom;
  transform: scaleY(${({ $playing }) => ($playing ? 1 : 0.25)});

  ${({ $playing, $reducedMotion, $delay }) =>
    $playing && !$reducedMotion
      ? css`
          animation: ${eqBounce} 0.6s ease-in-out infinite;
          animation-delay: ${$delay}ms;
        `
      : ""}
`;

// --- Sticky player ---

const PlayerBar = styled.div`
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--paper-card);
  border-top: 1px solid var(--rule-mid);
  box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.08);
  z-index: 50;
`;

const PlayerInner = styled.div`
  max-width: 760px;
  margin: 0 auto;
  padding: 12px 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  @media (max-width: 700px) {
    padding: 10px 16px 14px;
  }
`;

const PlayerTop = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
`;

const PlayBtn = styled.button<{ $playing: boolean }>`
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1.5px solid var(--gilt-warm);
  background: ${({ $playing }) =>
    $playing ? "var(--gilt-warm)" : "transparent"};
  color: ${({ $playing }) =>
    $playing ? "var(--ink-primary)" : "var(--gilt-warm)"};
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: var(--gilt-warm);
    color: var(--ink-primary);
  }
`;

const StepBtn = styled.button`
  flex-shrink: 0;
  background: transparent;
  border: none;
  color: var(--ink-muted);
  font-size: 15px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;

  &:hover {
    color: var(--ink-primary);
  }
  &:disabled {
    opacity: 0.3;
    cursor: default;
  }
`;

const NowInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const NowTitle = styled.div`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NowSub = styled.div`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const Toggle = styled.div`
  display: flex;
  gap: 0;
`;

const ToggleBtn = styled.button<{ $active: boolean }>`
  font-family: var(--font-labels-stack);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 9px;
  border: 1px solid
    ${({ $active }) => ($active ? "var(--gilt-warm)" : "var(--rule-light)")};
  background: ${({ $active }) =>
    $active ? "var(--gilt-warm)" : "transparent"};
  color: ${({ $active }) =>
    $active ? "var(--ink-primary)" : "var(--ink-muted)"};
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;

  &:not(:last-child) {
    border-right: none;
  }
  &:hover {
    color: var(--ink-primary);
  }
`;

const SeekRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

const SeekInput = styled.input`
  flex: 1;
  height: 4px;
  accent-color: var(--gilt-warm);
  cursor: pointer;
`;

const TimeLabel = styled.span`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 10px;
  color: var(--ink-muted);
  flex-shrink: 0;
  min-width: 38px;
`;

const License = styled.a`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 9px;
  color: var(--ink-muted);
  text-decoration: none;
  border: 1px solid var(--rule-light);
  padding: 2px 6px;
  border-radius: 2px;
  letter-spacing: 0.05em;
  flex-shrink: 0;

  &:hover {
    color: var(--gilt-deep);
    border-color: var(--gilt-warm);
  }
`;

const EQ_DELAYS = [0, 120, 240, 80];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ListenView({
  chapters,
  startChapter,
  startPosition,
  startLang,
  isSignedIn,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  const [currentNum, setCurrentNum] = useState(startChapter);
  const [lang, setLang] = useState<NarrationLang>(startLang);
  const [speed, setSpeed] = useState<Speed>(1);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(startPosition);
  const [duration, setDuration] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // Refs that the src-change effect and event handlers read without re-running.
  const playingRef = useRef(false);
  const pendingSeekRef = useRef<number>(startPosition);
  const lastSaveRef = useRef<number>(0);

  const indexByNum = useMemo(
    () => new Map(chapters.map((c, i) => [c.num, i])),
    [chapters],
  );
  const currentIndex = indexByNum.get(currentNum) ?? 0;
  const currentChapter = chapters[currentIndex];
  const nextChapter = chapters[currentIndex + 1] ?? null;
  const prevChapter = currentIndex > 0 ? chapters[currentIndex - 1] : null;

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // --- Progress persistence ---------------------------------------------

  const saveProgress = useCallback(
    (opts?: { keepalive?: boolean }) => {
      if (!isSignedIn) return;
      const audio = audioRef.current;
      const pos = audio ? audio.currentTime : position;
      lastSaveRef.current = Date.now();
      void fetch("/api/book-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listenChapter: currentNum,
          listenPosition: pos,
          listenLang: lang,
        }),
        keepalive: opts?.keepalive ?? false,
      }).catch(() => {});
    },
    [isSignedIn, currentNum, lang, position],
  );

  // Flush progress when the tab is hidden or unloaded.
  useEffect(() => {
    if (!isSignedIn) return;
    const flush = () => saveProgress({ keepalive: true });
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isSignedIn, saveProgress]);

  // --- Source management -------------------------------------------------

  // Whenever the chapter or language changes, point the single <audio> element
  // at the new file. Resume playback if we were already playing (auto-advance,
  // language switch, or clicking a new chapter all rely on this).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const url =
      getNarrationUrl(lang, currentNum) ??
      getNarrationUrl(lang === "en" ? "fr" : "en", currentNum);
    if (!url) return;

    audio.src = url;
    audio.playbackRate = speed;
    audio.load();

    if (playingRef.current) {
      audio.play().catch((err) => {
        console.warn("[ListenView] play() rejected:", err);
        setPlaying(false);
      });
    }
    // speed intentionally excluded — handled by its own effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNum, lang]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // Auto-scroll the active row into view when the chapter changes.
  useEffect(() => {
    const el = rowRefs.current.get(currentNum);
    if (!el) return;
    el.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [currentNum, reducedMotion]);

  // --- Audio event handlers ---------------------------------------------

  const handleLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration);
    if (pendingSeekRef.current > 0 && pendingSeekRef.current < audio.duration) {
      audio.currentTime = pendingSeekRef.current;
      setPosition(pendingSeekRef.current);
    }
    pendingSeekRef.current = 0;
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setPosition(audio.currentTime);
    if (Date.now() - lastSaveRef.current > 10_000) {
      saveProgress();
    }
  }, [saveProgress]);

  // Auto-advance to the next chapter so the book plays end to end.
  const handleEnded = useCallback(() => {
    saveProgress();
    if (nextChapter) {
      pendingSeekRef.current = 0;
      playingRef.current = true;
      setPlaying(true);
      setPosition(0);
      setCurrentNum(nextChapter.num);
    } else {
      setPlaying(false);
    }
  }, [nextChapter, saveProgress]);

  // --- User actions ------------------------------------------------------

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      saveProgress();
    } else {
      audio.play().catch((err) => {
        console.warn("[ListenView] play() rejected:", err);
      });
      setPlaying(true);
    }
  }, [playing, saveProgress]);

  const selectChapter = useCallback(
    (num: string, autoplay: boolean) => {
      if (num === currentNum) {
        if (autoplay) togglePlay();
        return;
      }
      saveProgress();
      pendingSeekRef.current = 0;
      setPosition(0);
      if (autoplay) {
        playingRef.current = true;
        setPlaying(true);
      }
      setCurrentNum(num);
    },
    [currentNum, togglePlay, saveProgress],
  );

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = parseFloat(e.target.value);
    audio.currentTime = t;
    setPosition(t);
  }, []);

  const switchLang = useCallback(
    (next: NarrationLang) => {
      if (next === lang) return;
      pendingSeekRef.current = 0; // start the new narration from the top
      setPosition(0);
      setLang(next);
      saveProgress();
    },
    [lang, saveProgress],
  );

  return (
    <Page>
      <Inner>
        <TopBar>
          <BreadcrumbBar
            crumbs={[
              { label: "Le Comte de Monte-Cristo", href: "/" },
              { label: "Listen" },
            ]}
          />
          <TopLink href="/read">Read instead →</TopLink>
        </TopBar>

        <Heading>
          <Kicker>Listen end to end</Kicker>
          <Title>The Count of Monte Cristo</Title>
          <Sub>
            {chapters.length} chapters · narrated by{" "}
            {NARRATION_NARRATOR[lang]} · plays continuously
          </Sub>
        </Heading>

        <List>
          {chapters.map((ch) => {
            const active = ch.num === currentNum;
            return (
              <Row
                key={ch.num}
                $active={active}
                ref={(el) => {
                  if (el) rowRefs.current.set(ch.num, el);
                  else rowRefs.current.delete(ch.num);
                }}
                onClick={() => selectChapter(ch.num, true)}
              >
                <RowNum $active={active}>{ch.num}</RowNum>
                <RowTitle $active={active}>{ch.title}</RowTitle>
                {active && (
                  <EqBars aria-hidden="true">
                    {EQ_DELAYS.map((d, i) => (
                      <EqBar
                        key={i}
                        $playing={playing}
                        $reducedMotion={reducedMotion}
                        $delay={d}
                      />
                    ))}
                  </EqBars>
                )}
              </Row>
            );
          })}
        </List>
      </Inner>

      <PlayerBar>
        <PlayerInner>
          <PlayerTop>
            <StepBtn
              onClick={() => prevChapter && selectChapter(prevChapter.num, true)}
              disabled={!prevChapter}
              aria-label="Previous chapter"
              title="Previous chapter"
            >
              ⏮
            </StepBtn>
            <PlayBtn
              $playing={playing}
              onClick={togglePlay}
              aria-label={playing ? "Pause" : "Play"}
              title={playing ? "Pause" : "Play"}
            >
              {playing ? "⏸" : "▶"}
            </PlayBtn>
            <StepBtn
              onClick={() => nextChapter && selectChapter(nextChapter.num, true)}
              disabled={!nextChapter}
              aria-label="Next chapter"
              title="Next chapter"
            >
              ⏭
            </StepBtn>

            <NowInfo>
              <NowTitle>
                {currentChapter.num}. {currentChapter.title}
              </NowTitle>
              <NowSub>
                Chapter {currentIndex + 1} of {chapters.length}
              </NowSub>
            </NowInfo>

            <Controls>
              <Toggle>
                {(["en", "fr"] as NarrationLang[]).map((l) => (
                  <ToggleBtn
                    key={l}
                    $active={lang === l}
                    aria-pressed={lang === l}
                    onClick={() => switchLang(l)}
                  >
                    {l}
                  </ToggleBtn>
                ))}
              </Toggle>
              <Toggle>
                {SPEEDS.map((s) => (
                  <ToggleBtn
                    key={s}
                    $active={speed === s}
                    aria-pressed={speed === s}
                    onClick={() => setSpeed(s)}
                  >
                    {s}×
                  </ToggleBtn>
                ))}
              </Toggle>
              <License
                href={NARRATION_LICENSE_URL}
                target="_blank"
                rel="noopener noreferrer"
                title={`LibriVox · ${NARRATION_LICENSE}`}
              >
                {NARRATION_LICENSE}
              </License>
            </Controls>
          </PlayerTop>

          <SeekRow>
            <TimeLabel>{formatTime(position)}</TimeLabel>
            <SeekInput
              type="range"
              min={0}
              max={duration || 0}
              step={1}
              value={Math.min(position, duration || position)}
              onChange={handleSeek}
              aria-label="Playback position"
            />
            <TimeLabel>{formatTime(duration)}</TimeLabel>
          </SeekRow>
        </PlayerInner>
      </PlayerBar>

      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />
    </Page>
  );
}
