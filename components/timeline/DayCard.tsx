"use client";

import styled from "styled-components";
import type { Installment } from "@/lib/installments";

interface Props {
  installment: Installment;
  isActive: boolean;
  isCompleted: boolean;
  onClick: (date: string) => void;
}

// ---------------------------------------------------------------------------
// Styled pieces
// ---------------------------------------------------------------------------

const Card = styled.button<{ $active: boolean; $completed: boolean }>`
  flex: none;
  width: 148px;
  padding: 13px 14px;
  border-radius: 2px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.25s, box-shadow 0.25s;

  /* Inactive */
  background: ${({ $active }) =>
    $active ? "var(--gilt-warm)" : "var(--paper-card)"};
  color: ${({ $active }) =>
    $active ? "var(--ink-primary)" : "var(--ink-secondary)"};
  border: 1px solid
    ${({ $active }) =>
      $active ? "var(--gilt-warm)" : "var(--rule-light)"};
  box-shadow: ${({ $active }) =>
    $active ? "0 10px 26px rgba(201,162,75,.4)" : "none"};

  &:hover:not([data-active="true"]) {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(29, 20, 10, 0.12);
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }
`;

const MonthLabel = styled.div<{ $active: boolean }>`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: ${({ $active }) => ($active ? "var(--ink-primary)" : "var(--gilt-deep)")};
`;

const DayNumber = styled.div`
  font-family: var(--font-display-stack);
  font-weight: 900;
  font-size: 30px;
  line-height: 1;
  margin: 3px 0;
`;

const ChapterNote = styled.div<{ $active: boolean }>`
  font-style: italic;
  font-size: 12.5px;
  color: ${({ $active }) => ($active ? "var(--ink-secondary)" : "var(--ink-muted)")};
  line-height: 1.35;
`;

const CompletedDot = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ink-tertiary);
  margin-top: 8px;
  opacity: 0.7;
`;

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const MONTHS = [
  "Jan", "Fév", "Mars", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

function parseDate(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return { month: MONTHS[m - 1], day: d };
}

function abbreviateLabel(label: string): string {
  // Take first 2 chapter titles max, trimmed short
  const parts = label.split("·").map((s) => s.trim());
  const first = parts[0];
  if (first.length <= 40) return first;
  return first.slice(0, 38) + "…";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DayCard({ installment, isActive, isCompleted, onClick }: Props) {
  const { month, day } = parseDate(installment.date);
  const chapNote = abbreviateLabel(installment.label);

  return (
    <Card
      $active={isActive}
      $completed={isCompleted}
      data-active={isActive}
      onClick={() => onClick(installment.date)}
      aria-pressed={isActive}
      aria-label={`${month} ${day} — ${chapNote}`}
      id={`card-${installment.date}`}
    >
      <MonthLabel $active={isActive}>{month}</MonthLabel>
      <DayNumber>{day}</DayNumber>
      <ChapterNote $active={isActive}>{chapNote}</ChapterNote>
      {isCompleted && <CompletedDot title="Completed" />}
    </Card>
  );
}
