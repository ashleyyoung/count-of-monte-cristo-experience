"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  parseISO,
  getDay,
} from "date-fns";
import { getAll, getFirst, getLast } from "@/lib/installments";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function formatDisplayDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Root = styled.div`
  position: relative;
  display: inline-block;
`;

const Trigger = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-display-stack);
  font-style: italic;
  font-size: 16px;
  color: var(--ink-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
  padding: 4px 10px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;

  &:hover {
    color: var(--ink-primary);
    border-color: var(--rule-mid);
    background: rgba(120, 84, 40, 0.04);
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }

  @media (max-width: 700px) {
    font-size: 14px;
    padding: 2px 6px;
  }
`;

const CalendarIcon = styled.svg`
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  color: var(--gilt-deep);
  transition: color 0.15s;

  ${Trigger}:hover & {
    color: var(--gilt-warm);
  }
`;

const Popover = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  width: 280px;
  padding: 14px;
  background: var(--paper-card);
  border: 1px solid var(--rule-mid);
  border-radius: 3px;
  box-shadow: 0 12px 32px rgba(29, 20, 10, 0.18);

  @media (max-width: 700px) {
    left: 0;
    transform: none;
    width: min(280px, calc(100vw - 40px));
  }
`;

const PopoverHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
`;

const MonthLabel = styled.span`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: 14px;
  color: var(--ink-primary);
`;

const NavBtn = styled.button<{ $disabled?: boolean }>`
  font-family: var(--font-labels-stack);
  font-size: 14px;
  line-height: 1;
  width: 28px;
  height: 28px;
  border: 1px solid var(--rule-mid);
  border-radius: 2px;
  background: transparent;
  color: ${({ $disabled }) => ($disabled ? "var(--rule-light)" : "var(--ink-tertiary)")};
  cursor: ${({ $disabled }) => ($disabled ? "default" : "pointer")};
  pointer-events: ${({ $disabled }) => ($disabled ? "none" : "auto")};
  transition: color 0.15s, border-color 0.15s;

  &:hover:not(:disabled) {
    color: var(--ink-primary);
    border-color: var(--ink-secondary);
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 1px;
  }
`;

const WeekdayRow = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 4px;
`;

const Weekday = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: center;
  color: var(--ink-muted);
  padding: 2px 0;
`;

const DayGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
`;

const DayCell = styled.button<{
  $isInstallment: boolean;
  $isActive: boolean;
  $isEmpty: boolean;
}>`
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-body-stack);
  font-size: 13px;
  border: 1px solid transparent;
  border-radius: 2px;
  padding: 0;
  background: ${({ $isActive }) =>
    $isActive ? "var(--gilt-warm)" : "transparent"};
  color: ${({ $isActive, $isInstallment, $isEmpty }) => {
    if ($isEmpty) return "transparent";
    if ($isActive) return "var(--ink-primary)";
    if ($isInstallment) return "var(--ink-secondary)";
    return "var(--rule-light)";
  }};
  font-weight: ${({ $isActive, $isInstallment }) =>
    $isActive || $isInstallment ? 600 : 400};
  cursor: ${({ $isInstallment }) => ($isInstallment ? "pointer" : "default")};
  pointer-events: ${({ $isInstallment }) => ($isInstallment ? "auto" : "none")};

  &:hover:not(:disabled) {
    ${({ $isInstallment, $isActive }) =>
      $isInstallment && !$isActive
        ? `
      border-color: var(--rule-mid);
      background: rgba(201, 162, 75, 0.12);
    `
        : ""}
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 1px;
  }
`;

const Hint = styled.p`
  margin: 10px 0 0;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  color: var(--ink-muted);
  text-align: center;
  line-height: 1.35;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  activeDate: string;
}

export default function DayDatePicker({ activeDate }: Props) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => parseISO(activeDate));

  const installmentDates = useMemo(() => {
    const set = new Set<string>();
    for (const inst of getAll()) set.add(inst.date);
    return set;
  }, []);

  const scheduleStart = useMemo(() => startOfMonth(parseISO(getFirst().date)), []);
  const scheduleEnd = useMemo(() => startOfMonth(parseISO(getLast().date)), []);

  const canGoPrev = startOfMonth(viewMonth) > scheduleStart;
  const canGoNext = startOfMonth(viewMonth) < scheduleEnd;

  const monthDays = useMemo(() => {
    const start = startOfMonth(viewMonth);
    const end = endOfMonth(viewMonth);
    return eachDayOfInterval({ start, end });
  }, [viewMonth]);

  const leadingBlanks = getDay(startOfMonth(viewMonth));

  useEffect(() => {
    setViewMonth(parseISO(activeDate));
  }, [activeDate]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleSelect = useCallback(
    (iso: string) => {
      setOpen(false);
      if (iso !== activeDate) router.push(`/day/${iso}`);
    },
    [activeDate, router],
  );

  const displayLabel = formatDisplayDate(activeDate);

  return (
    <Root ref={rootRef}>
      <Trigger
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Current date: ${displayLabel}. Choose another installment date.`}
      >
        {displayLabel}
        <CalendarIcon viewBox="0 0 16 16" aria-hidden>
          <rect x="2" y="3.5" width="12" height="10.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1.25" />
          <line x1="2" y1="6.5" x2="14" y2="6.5" stroke="currentColor" strokeWidth="1.25" />
          <line x1="5.25" y1="1.75" x2="5.25" y2="4.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
          <line x1="10.75" y1="1.75" x2="10.75" y2="4.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </CalendarIcon>
      </Trigger>

      {open && (
        <Popover role="dialog" aria-label="Choose installment date">
          <PopoverHeader>
            <NavBtn
              type="button"
              $disabled={!canGoPrev}
              onClick={() => canGoPrev && setViewMonth((m) => subMonths(m, 1))}
              aria-label="Previous month"
            >
              ←
            </NavBtn>
            <MonthLabel>{format(viewMonth, "MMMM yyyy")}</MonthLabel>
            <NavBtn
              type="button"
              $disabled={!canGoNext}
              onClick={() => canGoNext && setViewMonth((m) => addMonths(m, 1))}
              aria-label="Next month"
            >
              →
            </NavBtn>
          </PopoverHeader>

          <WeekdayRow>
            {WEEKDAYS.map((d) => (
              <Weekday key={d}>{d}</Weekday>
            ))}
          </WeekdayRow>

          <DayGrid>
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <DayCell
                key={`blank-${i}`}
                type="button"
                tabIndex={-1}
                disabled
                $isEmpty
                $isInstallment={false}
                $isActive={false}
                aria-hidden
              />
            ))}
            {monthDays.map((day) => {
              const iso = toIsoDate(day);
              const isInstallment = installmentDates.has(iso);
              const isActive = iso === activeDate;
              return (
                <DayCell
                  key={iso}
                  type="button"
                  $isEmpty={false}
                  $isInstallment={isInstallment}
                  $isActive={isActive}
                  onClick={() => isInstallment && handleSelect(iso)}
                  aria-label={
                    isInstallment
                      ? `${format(day, "MMMM d, yyyy")}${isActive ? ", current" : ""}`
                      : undefined
                  }
                  aria-current={isActive ? "date" : undefined}
                  tabIndex={isInstallment ? 0 : -1}
                >
                  {format(day, "d")}
                </DayCell>
              );
            })}
          </DayGrid>

          <Hint>Highlighted dates are published installments.</Hint>
        </Popover>
      )}
    </Root>
  );
}
