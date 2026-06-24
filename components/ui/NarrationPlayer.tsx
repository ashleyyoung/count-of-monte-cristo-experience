"use client";

/**
 * components/ui/NarrationPlayer.tsx
 *
 * Chapter narration audio player for LibriVox recordings.
 *
 * Features:
 *  - EN / FR language toggle (hidden when only one language is available)
 *  - Gesture-gated HTML5 audio (no autoplay)
 *  - Play/pause with EQ bar animation (matches AudioPlayer visual language)
 *  - Seek bar with elapsed / total time
 *  - Playback speed: 0.75×  1×  1.25×  1.5×
 *  - Narrator credit + Public Domain link
 *  - Respects prefers-reduced-motion
 */

import React, { useRef, useState, useCallback, useEffect } from "react";
import styled, { keyframes, css } from "styled-components";
import {
  type NarrationLang,
  getNarrationUrl,
  NARRATION_NARRATOR,
  NARRATION_SOURCE,
  NARRATION_LICENSE,
  NARRATION_LICENSE_URL,
  NARRATION_PLAYER_ID,
} from "@/lib/narration";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NarrationPlayerProps {
  chapterNum: string;
  chapterTitle: string;
  availableLangs: NarrationLang[];
  /** Initially selected language. Defaults to "en" if available, else "fr". */
  defaultLang?: NarrationLang;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
type Speed = (typeof SPEEDS)[number];

const EQ_DELAYS = [0, 120, 240, 80];

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

const eqBounce = keyframes`
  0%, 100% { transform: scaleY(0.25); }
  50%       { transform: scaleY(1); }
`;

const Shell = styled.div`
  border: 1px solid var(--rule-light);
  background: var(--paper-card);
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 640px;
`;

const TopRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`;

const PlayBtn = styled.button<{ $playing: boolean }>`
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1.5px solid var(--gilt-warm);
  background: ${({ $playing }) => ($playing ? "var(--gilt-warm)" : "transparent")};
  color: ${({ $playing }) => ($playing ? "var(--ink-primary)" : "var(--gilt-warm)")};
  font-size: 13px;
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

const ChapterInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const ChapterLabel = styled.div`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-primary);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const NarratorLine = styled.div`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const EqBars = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
  flex-shrink: 0;
`;

const EqBar = styled.span<{ $playing: boolean; $reducedMotion: boolean; $delay: number }>`
  display: block;
  width: 3px;
  height: 14px;
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

const SeekRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const SeekInput = styled.input`
  flex: 1;
  height: 3px;
  accent-color: var(--gilt-warm);
  cursor: pointer;
`;

const TimeLabel = styled.span`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 10px;
  color: var(--ink-muted);
  flex-shrink: 0;
  min-width: 36px;
  text-align: right;
`;

const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
`;

const LangToggle = styled.div`
  display: flex;
  gap: 4px;
`;

const LangBtn = styled.button<{ $active: boolean }>`
  font-family: var(--font-labels-stack);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 3px 9px;
  border: 1px solid ${({ $active }) => ($active ? "var(--gilt-warm)" : "var(--rule-light)")};
  background: ${({ $active }) => ($active ? "var(--gilt-warm)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--ink-primary)" : "var(--ink-muted)")};
  cursor: pointer;
  border-radius: 2px;
  transition: background 0.12s, border-color 0.12s, color 0.12s;

  &:hover:not([aria-pressed="true"]) {
    border-color: var(--rule-mid);
    color: var(--ink-secondary);
  }
`;

const SpeedToggle = styled.div`
  display: flex;
  gap: 0;
`;

const SpeedBtn = styled.button<{ $active: boolean }>`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 9px;
  padding: 3px 7px;
  border: 1px solid var(--rule-light);
  border-right: none;
  background: ${({ $active }) => ($active ? "rgba(201,162,75,0.15)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--gilt-deep)" : "var(--ink-muted)")};
  cursor: pointer;
  transition: background 0.12s, color 0.12s;

  &:first-child { border-radius: 2px 0 0 2px; }
  &:last-child  { border-right: 1px solid var(--rule-light); border-radius: 0 2px 2px 0; }

  &:hover:not([aria-pressed="true"]) {
    background: rgba(201,162,75,0.08);
    color: var(--ink-secondary);
  }
`;

const LicenseLink = styled.a`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 9px;
  color: var(--ink-muted);
  text-decoration: none;
  border: 1px solid var(--rule-light);
  padding: 1px 5px;
  border-radius: 2px;
  letter-spacing: 0.05em;
  flex-shrink: 0;

  &:hover { color: var(--gilt-deep); border-color: var(--gilt-warm); }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NarrationPlayer({
  chapterNum,
  chapterTitle,
  availableLangs,
  defaultLang,
}: NarrationPlayerProps) {
  const initialLang: NarrationLang =
    defaultLang && availableLangs.includes(defaultLang)
      ? defaultLang
      : availableLangs[0];

  const [activeLang, setActiveLang] = useState<NarrationLang>(initialLang);
  const [speed, setSpeed] = useState<Speed>(1);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Scroll into view when arriving via "Listen to this chapter" (#narration).
  useEffect(() => {
    const scrollToPlayer = () => {
      if (window.location.hash !== "#narration") return;
      const el = document.getElementById(NARRATION_PLAYER_ID);
      if (!el) return;
      el.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    };

    const timer = window.setTimeout(scrollToPlayer, 50);
    window.addEventListener("hashchange", scrollToPlayer);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", scrollToPlayer);
    };
  }, [chapterNum, reducedMotion]);

  const url = getNarrationUrl(activeLang, chapterNum);

  // Rebuild the audio element whenever the URL or speed changes.
  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      if (!url) return null;
      const audio = new Audio(url);
      audio.playbackRate = speed;
      audio.addEventListener("ended", () => setPlaying(false));
      audio.addEventListener("timeupdate", () => {
        if (audio.duration) {
          setProgress(audio.currentTime / audio.duration);
          setElapsed(audio.currentTime);
        }
      });
      audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
      audioRef.current = audio;
    }
    return audioRef.current;
  }, [url, speed]);

  // Clean up when language or URL changes.
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlaying(false);
      setProgress(0);
      setElapsed(0);
      setDuration(0);
    };
  }, [url]);

  // Apply speed changes to the existing audio element without recreating it.
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  const togglePlay = useCallback(() => {
    const audio = getAudio();
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch((err) => {
        console.warn("[NarrationPlayer] play() rejected:", err);
      });
      setPlaying(true);
    }
  }, [playing, getAudio]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = getAudio();
      if (!audio) return;
      const ratio = parseFloat(e.target.value);
      if (audio.duration) {
        audio.currentTime = audio.duration * ratio;
        setProgress(ratio);
        setElapsed(audio.currentTime);
      }
    },
    [getAudio],
  );

  const handleLangSwitch = useCallback(
    (lang: NarrationLang) => {
      if (lang === activeLang) return;
      // Pause current playback before switching language (the URL effect
      // cleanup will reset state).
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlaying(false);
      setActiveLang(lang);
    },
    [activeLang],
  );

  const chapterLabel = `Chapter ${chapterNum} · ${chapterTitle}`;
  const narrator = NARRATION_NARRATOR[activeLang];
  const source = NARRATION_SOURCE[activeLang];

  if (!url) return null;

  return (
    <Shell id={NARRATION_PLAYER_ID} tabIndex={-1}>
      <TopRow>
        <PlayBtn
          $playing={playing}
          onClick={togglePlay}
          aria-label={playing ? `Pause ${chapterLabel}` : `Play ${chapterLabel}`}
          title={playing ? "Pause" : "Play"}
        >
          {playing ? "⏸" : "▶"}
        </PlayBtn>

        <ChapterInfo>
          <ChapterLabel>{chapterLabel}</ChapterLabel>
          <NarratorLine>
            {narrator} · {source}
          </NarratorLine>
        </ChapterInfo>

        <EqBars aria-hidden="true">
          {EQ_DELAYS.map((delay, i) => (
            <EqBar
              key={i}
              $playing={playing}
              $reducedMotion={reducedMotion}
              $delay={delay}
            />
          ))}
        </EqBars>
      </TopRow>

      <SeekRow>
        <TimeLabel>{formatTime(elapsed)}</TimeLabel>
        <SeekInput
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={handleSeek}
          aria-label="Playback position"
        />
        <TimeLabel>{formatTime(duration)}</TimeLabel>
      </SeekRow>

      <ControlsRow>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {availableLangs.length > 1 && (
            <LangToggle aria-label="Narration language">
              {availableLangs.map((lang) => (
                <LangBtn
                  key={lang}
                  $active={lang === activeLang}
                  aria-pressed={lang === activeLang}
                  onClick={() => handleLangSwitch(lang)}
                >
                  {lang.toUpperCase()}
                </LangBtn>
              ))}
            </LangToggle>
          )}

          <SpeedToggle aria-label="Playback speed">
            {SPEEDS.map((s) => (
              <SpeedBtn
                key={s}
                $active={s === speed}
                aria-pressed={s === speed}
                onClick={() => setSpeed(s)}
                title={`${s}× speed`}
              >
                {s}×
              </SpeedBtn>
            ))}
          </SpeedToggle>
        </div>

        <LicenseLink
          href={NARRATION_LICENSE_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="LibriVox public domain recordings"
        >
          {NARRATION_LICENSE}
        </LicenseLink>
      </ControlsRow>
    </Shell>
  );
}
