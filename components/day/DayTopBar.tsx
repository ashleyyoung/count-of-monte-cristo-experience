"use client";

import styled from "styled-components";
import Link from "next/link";
import type { Installment } from "@/lib/installments";
import ProgressCheck from "@/components/timeline/ProgressCheck";
import DayDatePicker from "@/components/day/DayDatePicker";

interface Props {
  installment: Installment;
  prevDate: string | null;
  nextDate: string | null;
  isCompleted: boolean;
  isSignedIn: boolean;
  onToggleComplete: (date: string, completed: boolean) => void;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Bar = styled.header`
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  border-bottom: 1px solid var(--rule-mid);
  background: rgba(120, 84, 40, 0.06);
  padding: 16px 32px;
  gap: 16px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "left right"
      "center center";
    padding: 12px 20px;
  }
`;

const Left = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;

  @media (max-width: 700px) {
    grid-area: left;
  }
`;

const InstallmentLabel = styled.span`
  font-family: var(--font-display-stack);
  font-weight: 900;
  font-size: 15px;
  color: var(--gilt-deep);
  letter-spacing: 0.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ChapterSubtitle = styled.span`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-muted);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Center = styled.div`
  text-align: center;

  @media (max-width: 700px) {
    grid-area: center;
    padding-top: 2px;
  }
`;

const Right = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;

  @media (max-width: 700px) {
    grid-area: right;
  }
`;

const NavBtn = styled(Link)<{ $disabled?: boolean }>`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  color: ${({ $disabled }) => ($disabled ? "var(--rule-mid)" : "var(--ink-tertiary)")};
  text-decoration: none;
  pointer-events: ${({ $disabled }) => ($disabled ? "none" : "auto")};
  padding: 4px 8px;
  border: 1px solid ${({ $disabled }) => ($disabled ? "var(--rule-light)" : "var(--rule-mid)")};
  border-radius: 2px;
  transition: color 0.15s, border-color 0.15s;

  &:hover {
    color: var(--ink-primary);
    border-color: var(--ink-secondary);
  }
`;

const Breadcrumb = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
  margin-bottom: 4px;

  a {
    color: var(--ink-muted);
    text-decoration: none;
    &:hover { color: var(--ink-primary); }
  }

  span { color: var(--rule-mid); }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DayTopBar({
  installment,
  prevDate,
  nextDate,
  isCompleted,
  isSignedIn,
  onToggleComplete,
}: Props) {
  return (
    <Bar>
      <Left>
        <Breadcrumb>
          <Link href="/">Journal des Débats</Link>
          <span>/</span>
          <Link href="/timeline">Timeline</Link>
          <span>/</span>
          <span>{installment.date}</span>
        </Breadcrumb>
        <InstallmentLabel>
          Installment {installment.global_index} of 139
        </InstallmentLabel>
        <ChapterSubtitle>{installment.label}</ChapterSubtitle>
      </Left>

      <Center>
        <DayDatePicker activeDate={installment.date} />
      </Center>

      <Right>
        <NavBtn
          href={prevDate ? `/day/${prevDate}` : "#"}
          $disabled={!prevDate}
          aria-label="Previous installment"
          aria-disabled={!prevDate}
        >
          ← Prev
        </NavBtn>
        <ProgressCheck
          date={installment.date}
          isCompleted={isCompleted}
          isSignedIn={isSignedIn}
          onToggle={onToggleComplete}
        />
        <NavBtn
          href={nextDate ? `/day/${nextDate}` : "#"}
          $disabled={!nextDate}
          aria-label="Next installment"
          aria-disabled={!nextDate}
        >
          Next →
        </NavBtn>
      </Right>
    </Bar>
  );
}
