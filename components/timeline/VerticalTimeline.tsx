"use client";

import { useEffect, useRef } from "react";
import styled from "styled-components";
import { motion, useInView, useReducedMotion } from "framer-motion";
import Link from "next/link";
import type { Installment, SchedulePart } from "@/lib/installments";
import ProgressCheck from "./ProgressCheck";

interface Props {
  installments: Installment[];
  parts: Omit<SchedulePart, "installments">[];
  completedDates: Set<string>;
  initialScrollDate: string | null;
  onToggleComplete: (date: string, completed: boolean) => void;
  isSignedIn: boolean;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Wrapper = styled.div`
  padding: 32px 0 60px;
  background: var(--paper-base);
`;

// Part header
const PartHeader = styled.div`
  padding: 32px 36px 16px;
  border-bottom: 2px solid var(--rule-strong);
  margin-bottom: 4px;

  @media (max-width: 600px) {
    padding: 24px 20px 14px;
  }
`;

const PartNumber = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 4px;
`;

const PartTitle = styled.h2`
  font-family: var(--font-masthead-stack);
  font-size: clamp(22px, 3vw, 32px);
  font-weight: 400;
  color: var(--ink-primary);
  margin: 0 0 4px;
  line-height: 1.1;
`;

const PartMeta = styled.p`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-tertiary);
  margin: 0;
`;

// Hiatus block
const HiatusBlock = styled.div`
  margin: 0 36px;
  padding: 18px 24px;
  border: 1px dashed var(--rule-mid);
  border-top: none;
  border-bottom: none;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 6px,
    rgba(185, 165, 120, 0.06) 6px,
    rgba(185, 165, 120, 0.06) 12px
  );
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 2px;
  margin-bottom: 2px;
  flex-wrap: wrap;

  @media (max-width: 600px) {
    margin: 2px 20px;
    padding: 14px 16px;
  }
`;

const HiatusLabel = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--ink-muted);
`;

const HiatusRule = styled.div`
  flex: 1;
  height: 1px;
  background: repeating-linear-gradient(
    90deg,
    var(--rule-light) 0 4px,
    transparent 4px 8px
  );
`;

// Row
const Row = styled(motion.div)<{ $completed: boolean }>`
  display: grid;
  grid-template-columns: 120px 1fr auto;
  align-items: start;
  gap: 20px;
  padding: 14px 36px;
  border-bottom: 1px solid var(--rule-light);
  opacity: ${({ $completed }) => ($completed ? 0.65 : 1)};
  transition: background 0.15s;

  &:hover {
    background: var(--paper-card);
  }

  @media (max-width: 700px) {
    grid-template-columns: 80px 1fr auto;
    gap: 12px;
    padding: 12px 20px;
  }
`;

const RowDate = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const RowDayNum = styled.div`
  font-family: var(--font-display-stack);
  font-weight: 900;
  font-size: 28px;
  line-height: 1;
  color: var(--ink-primary);
`;

const RowMonthYear = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-tertiary);
  letter-spacing: 0.06em;
`;

const RowContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
`;

const RowChapterLabel = styled(Link)`
  font-family: var(--font-body-stack);
  font-size: 15px;
  color: var(--ink-secondary);
  text-decoration: none;
  line-height: 1.35;

  &:hover {
    color: var(--oxblood);
    text-decoration: underline;
    text-underline-offset: 2px;
  }
`;

const RowPartBadge = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-muted);
`;

const RowActions = styled.div`
  padding-top: 6px;
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS_SHORT = [
  "Jan", "Fév", "Mars", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

const PART_LABELS: Record<number, string> = {
  1: "Le Comte de Monte-Cristo — Première Partie",
  2: "Le Comte de Monte-Cristo — Deuxième Partie",
  3: "Le Comte de Monte-Cristo — Troisième Partie",
  4: "Le Comte de Monte-Cristo — Quatrième Partie",
};

function parseDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { year: y, month: MONTHS_SHORT[m - 1], day: d };
}

// ---------------------------------------------------------------------------
// Row with intersection-observer stagger animation
// ---------------------------------------------------------------------------

function InstallmentRow({
  installment,
  isCompleted,
  onToggleComplete,
  isSignedIn,
  delay,
}: {
  installment: Installment;
  isCompleted: boolean;
  onToggleComplete: (date: string, completed: boolean) => void;
  isSignedIn: boolean;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduceMotion = useReducedMotion();
  const { year, month, day } = parseDate(installment.date);

  return (
    <Row
      ref={ref}
      id={`d-${installment.date}`}
      $completed={isCompleted}
      initial={reduceMotion ? {} : { opacity: 0, y: 12 }}
      animate={inView ? { opacity: isCompleted ? 0.65 : 1, y: 0 } : {}}
      transition={{ duration: 0.3, delay: reduceMotion ? 0 : delay }}
    >
      <RowDate>
        <RowDayNum>{day}</RowDayNum>
        <RowMonthYear>
          {month} {year}
        </RowMonthYear>
      </RowDate>

      <RowContent>
        <RowChapterLabel href={`/day/${installment.date}`}>
          {installment.label}
        </RowChapterLabel>
        <RowPartBadge>Part {installment.part}</RowPartBadge>
      </RowContent>

      <RowActions>
        <ProgressCheck
          date={installment.date}
          isCompleted={isCompleted}
          isSignedIn={isSignedIn}
          onToggle={onToggleComplete}
        />
      </RowActions>
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VerticalTimeline({
  installments,
  parts,
  completedDates,
  initialScrollDate,
  onToggleComplete,
  isSignedIn,
}: Props) {
  // Auto-scroll to last location on mount
  useEffect(() => {
    if (!initialScrollDate) return;
    const el = document.getElementById(`d-${initialScrollDate}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [initialScrollDate]);

  // Build a map of part → installments
  const partGroups = new Map<number, Installment[]>();
  for (const inst of installments) {
    if (!partGroups.has(inst.part)) partGroups.set(inst.part, []);
    partGroups.get(inst.part)!.push(inst);
  }

  // Track row index for stagger
  let rowIndex = 0;

  return (
    <Wrapper>
      {parts.map((part) => {
        const partInsts = partGroups.get(part.part) ?? [];
        // Find whether there is a hiatus after the last installment of this part
        const lastInst = partInsts[partInsts.length - 1];
        const hasHiatusAfter = lastInst?.is_hiatus_after ?? false;

        return (
          <div key={part.part}>
            {/* Part header */}
            <PartHeader>
              <PartNumber>Part {part.part} of 4</PartNumber>
              <PartTitle>{PART_LABELS[part.part]}</PartTitle>
              <PartMeta>
                {part.date_range} · {part.chapter_range}
              </PartMeta>
            </PartHeader>

            {/* Installment rows */}
            {partInsts.map((inst) => {
              const delay = Math.min((rowIndex++ % 8) * 0.04, 0.28);
              return (
                <InstallmentRow
                  key={inst.date}
                  installment={inst}
                  isCompleted={completedDates.has(inst.date)}
                  onToggleComplete={onToggleComplete}
                  isSignedIn={isSignedIn}
                  delay={delay}
                />
              );
            })}

            {/* Hiatus block after Part 2 */}
            {hasHiatusAfter && (
              <HiatusBlock>
                <HiatusLabel>— Seven-month hiatus —</HiatusLabel>
                <HiatusRule />
                <HiatusLabel>
                  October 1844 → June 1845
                </HiatusLabel>
              </HiatusBlock>
            )}
          </div>
        );
      })}
    </Wrapper>
  );
}
