"use client";

/**
 * DateSelector — linear scrubber across the full 1844-46 serialization span.
 *
 * Renders a continuous horizontal track divided into visible part bands and a
 * hiatus gap. Clicking anywhere on the track calls onSelect with the nearest
 * installment date. The active date is shown as a draggable thumb.
 */

import { useCallback, useRef } from "react";
import styled from "styled-components";
import type { Installment } from "@/lib/installments";

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const Wrapper = styled.div`
  padding: 0 36px;
  user-select: none;
`;

const Label = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 6px;
`;

const Track = styled.div`
  position: relative;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0;
`;

const Band = styled.div<{ $flex: number; $isHiatus: boolean }>`
  flex: ${({ $flex }) => $flex};
  height: 6px;
  background: ${({ $isHiatus }) =>
    $isHiatus
      ? "repeating-linear-gradient(90deg, var(--rule-light) 0 3px, transparent 3px 7px)"
      : "var(--rule-mid)"};
  opacity: ${({ $isHiatus }) => ($isHiatus ? 0.5 : 1)};
  border-radius: 2px;
  position: relative;

  &::before {
    content: attr(data-label);
    position: absolute;
    bottom: calc(100% + 4px);
    left: 0;
    font-family: var(--font-labels-stack);
    font-style: italic;
    font-size: 9px;
    letter-spacing: 0.1em;
    color: var(--ink-muted);
    white-space: nowrap;
  }
`;

const HiatusGap = styled.div`
  flex: 0 0 20px;
  height: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--rule-light);
  font-size: 9px;
  letter-spacing: 1px;
  position: relative;

  &::after {
    content: "· · ·";
    position: absolute;
    top: -3px;
    color: var(--rule-mid);
    font-size: 8px;
  }
`;

const Thumb = styled.div<{ $pct: number }>`
  position: absolute;
  left: ${({ $pct }) => `calc(${$pct}% - 6px)`};
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--gilt-warm);
  border: 2px solid var(--paper-base);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
  pointer-events: none;
  z-index: 2;
  transition: left 0.15s;
`;

const PartBandTick = styled.div<{ $pct: number }>`
  position: absolute;
  left: ${({ $pct }) => `${$pct}%`};
  top: 50%;
  transform: translateY(-50%);
  width: 1px;
  height: 14px;
  background: var(--rule-light);
  pointer-events: none;
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Hiatus is the gap between Part 2 (ends Oct 26 1844) and Part 3 (starts Jun 1 1845).
// We represent the full span as a timeline where each installment is equally spaced,
// except the hiatus which is given a compressed visual gap (not proportional to real days).
// Total "slots" = 139 installments + 1 compressed hiatus segment.

const TOTAL_SLOTS = 139 + 1; // +1 for the hiatus visual slot

function installmentSlot(globalIndex: number, hasHiatusBefore: boolean): number {
  // globalIndex is 1-based (1..139)
  // Installments in Part 1 (indices 1-32) and Part 2 (33-63): no hiatus before them
  // Installments in Part 3+ (64+): shift by 1 for the hiatus slot
  return hasHiatusBefore ? globalIndex + 1 : globalIndex;
}

function slotToPercent(slot: number): number {
  return ((slot - 0.5) / TOTAL_SLOTS) * 100;
}

// ---------------------------------------------------------------------------
// Part band config (static, derived from schedule shape)
// ---------------------------------------------------------------------------

interface BandConfig {
  label: string;
  slots: number; // number of installment slots in this band
  isHiatus?: boolean;
}

// Part 1: 32 installments, Part 2: 32 installments, hiatus, Part 3: 47 installments, Part 4: 28 installments
// These numbers come from content/schedule.json (verified from lib/installments.ts)
const BANDS: BandConfig[] = [
  { label: "Part I · Aug–Oct 1844", slots: 32 },
  { label: "Part II · Oct 1844", slots: 32 },
  { label: "", slots: 1, isHiatus: true },
  { label: "Part III · Jun–Nov 1845", slots: 47 },
  { label: "Part IV · Nov 1845–Jan 1846", slots: 28 },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  installments: Installment[];
  activeDate: string | null;
  onSelect: (date: string) => void;
}

export default function DateSelector({ installments, activeDate, onSelect }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Build a lookup: slot position → installment
  const slotMap = useCallback(() => {
    const map: Array<{ slot: number; inst: Installment }> = [];
    let hiatusCrossed = false;
    for (const inst of installments) {
      if (!hiatusCrossed && inst.is_hiatus_after) {
        hiatusCrossed = true;
      }
      // Installments after Part 2 (is_hiatus_after was true on a previous inst)
      const shifted = inst.global_index > 63;
      map.push({
        slot: installmentSlot(inst.global_index, shifted),
        inst,
      });
    }
    return map;
  }, [installments]);

  const activeInst = activeDate
    ? installments.find((i) => i.date === activeDate)
    : null;

  const activeSlot = activeInst
    ? installmentSlot(activeInst.global_index, activeInst.global_index > 63)
    : null;

  const thumbPct = activeSlot !== null ? slotToPercent(activeSlot) : null;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      const targetSlot = Math.round(pct * TOTAL_SLOTS) + 1;

      // Find the nearest installment by slot
      const map = slotMap();
      let best = map[0];
      let bestDist = Math.abs(best.slot - targetSlot);
      for (const entry of map) {
        const dist = Math.abs(entry.slot - targetSlot);
        if (dist < bestDist) {
          bestDist = dist;
          best = entry;
        }
      }
      onSelect(best.inst.date);
    },
    [slotMap, onSelect],
  );

  // Part-band divider tick positions (between parts)
  const tickPositions: number[] = [];
  let cumSlots = 0;
  for (let i = 0; i < BANDS.length - 1; i++) {
    cumSlots += BANDS[i].slots;
    tickPositions.push((cumSlots / TOTAL_SLOTS) * 100);
  }

  return (
    <Wrapper>
      <Label>Navigate the serialization</Label>
      <Track ref={trackRef} onClick={handleClick} role="slider" aria-label="Serialization date" aria-valuenow={activeInst?.global_index ?? 1} aria-valuemin={1} aria-valuemax={139}>
        {BANDS.map((band, i) => (
          band.isHiatus ? (
            <HiatusGap key={i} title="7-month hiatus" />
          ) : (
            <Band
              key={i}
              $flex={band.slots}
              $isHiatus={false}
              data-label={band.label}
            />
          )
        ))}
        {tickPositions.map((pct, i) => (
          <PartBandTick key={i} $pct={pct} />
        ))}
        {thumbPct !== null && <Thumb $pct={thumbPct} />}
      </Track>
    </Wrapper>
  );
}
