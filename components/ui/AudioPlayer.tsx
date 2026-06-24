"use client";

/**
 * components/ui/AudioPlayer.tsx
 *
 * Gesture-gated HTML5 audio player.
 * - No autoplay — first interaction must be an explicit user gesture.
 * - Animated EQ bars (shared visual language with ParisSidebar music card).
 * - Shows audio_license with external link when the license requires attribution.
 * - Respects prefers-reduced-motion.
 */

import React, { useRef, useState, useCallback, useEffect } from "react";
import styled, { keyframes, css } from "styled-components";

export interface AudioTrack {
  url: string;
  work_title: string;
  composer: string;
  audio_license: string;
  license_url?: string;
}

interface AudioPlayerProps {
  track: AudioTrack;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const eqBounce = keyframes`
  0%, 100% { transform: scaleY(0.25); }
  50%       { transform: scaleY(1); }
`;

const Shell = styled.div<{ $compact: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ $compact }) => ($compact ? "8px" : "12px")};
  padding: ${({ $compact }) => ($compact ? "6px 8px" : "10px 14px")};
  background: var(--paper-base);
  border: 1px solid var(--rule-light);
`;

const PlayBtn = styled.button<{ $playing: boolean; $compact: boolean }>`
  flex-shrink: 0;
  width: ${({ $compact }) => ($compact ? "28px" : "34px")};
  height: ${({ $compact }) => ($compact ? "28px" : "34px")};
  border-radius: 50%;
  border: 1.5px solid var(--gilt-warm);
  background: ${({ $playing }) => ($playing ? "var(--gilt-warm)" : "transparent")};
  color: ${({ $playing }) => ($playing ? "var(--ink-primary)" : "var(--gilt-warm)")};
  font-size: ${({ $compact }) => ($compact ? "10px" : "12px")};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;

  &:hover {
    background: var(--gilt-warm);
    color: var(--ink-primary);
  }
`;

const TrackInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

const WorkTitle = styled.div`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: 13px;
  color: var(--ink-primary);
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Composer = styled.div`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LicenseChip = styled.a`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 9px;
  color: var(--ink-muted);
  border: 1px solid var(--rule-light);
  padding: 1px 5px;
  border-radius: 2px;
  letter-spacing: 0.05em;
  text-decoration: none;
  flex-shrink: 0;

  &:hover { color: var(--gilt-deep); border-color: var(--gilt-warm); }
`;

const LicenseText = styled.span`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 9px;
  color: var(--ink-muted);
  border: 1px solid var(--rule-light);
  padding: 1px 5px;
  border-radius: 2px;
  letter-spacing: 0.05em;
  flex-shrink: 0;
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

const ProgressBar = styled.div`
  width: 100%;
  margin-top: 4px;
`;

const ProgressInput = styled.input`
  width: 100%;
  height: 3px;
  accent-color: var(--gilt-warm);
  cursor: pointer;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EQ_DELAYS = [0, 120, 240, 80];

export default function AudioPlayer({ track, compact = false }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  // Initialize from matchMedia synchronously to avoid a useEffect setState
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  // Keep reducedMotion in sync if the user changes their system preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const getAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio(track.url);
      audio.addEventListener("ended", () => setPlaying(false));
      audio.addEventListener("timeupdate", () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      });
      audio.addEventListener("loadedmetadata", () => setDuration(audio.duration));
      audioRef.current = audio;
    }
    return audioRef.current;
  }, [track.url]);

  // Cleanup on track change
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlaying(false);
      setProgress(0);
    };
  }, [track.url]);

  const togglePlay = useCallback(() => {
    const audio = getAudio();
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().catch((err) => {
        console.warn("[AudioPlayer] play() rejected:", err);
      });
      setPlaying(true);
    }
  }, [playing, getAudio]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const audio = getAudio();
      const ratio = parseFloat(e.target.value);
      if (audio.duration) {
        audio.currentTime = audio.duration * ratio;
        setProgress(ratio);
      }
    },
    [getAudio],
  );

  const hasLicenseLink = Boolean(track.license_url);
  const requiresLinkOut = !["CC0", "Public Domain", "public domain"].some(
    (free) => track.audio_license.toLowerCase().includes(free.toLowerCase()),
  );

  return (
    <Shell $compact={compact}>
      <PlayBtn
        $playing={playing}
        $compact={compact}
        onClick={togglePlay}
        aria-label={playing ? `Pause ${track.work_title}` : `Play ${track.work_title}`}
        title={playing ? "Pause" : "Play"}
      >
        {playing ? "⏸" : "▶"}
      </PlayBtn>

      <TrackInfo>
        <WorkTitle>{track.work_title}</WorkTitle>
        <Composer>{track.composer}</Composer>
        {!compact && duration > 0 && (
          <ProgressBar>
            <ProgressInput
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={progress}
              onChange={handleSeek}
              aria-label="Playback position"
            />
          </ProgressBar>
        )}
      </TrackInfo>

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

      {hasLicenseLink ? (
        <LicenseChip
          href={track.license_url}
          target="_blank"
          rel="noopener noreferrer"
          title={`License: ${track.audio_license}`}
        >
          {track.audio_license}
        </LicenseChip>
      ) : requiresLinkOut ? (
        <LicenseText title={`License may require linking out — ${track.audio_license}`}>
          {track.audio_license} ↗
        </LicenseText>
      ) : (
        <LicenseText>{track.audio_license}</LicenseText>
      )}
    </Shell>
  );
}
