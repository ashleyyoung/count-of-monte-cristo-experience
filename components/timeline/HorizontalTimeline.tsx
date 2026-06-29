"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import type { Installment } from "@/lib/installments";
import type { PacketContent } from "./PacketPanel";
import DayCard from "./DayCard";
import DateSelector from "./DateSelector";
import PacketPanel from "./PacketPanel";

interface Props {
  installments: Installment[];
  completedDates: Set<string>;
  initialDate: string | null;
  /** Called when a date is selected so parent can persist last_location */
  onDateSelect?: (date: string) => void;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Wrapper = styled.div`
  background: var(--paper-base);
  padding-bottom: 40px;
`;

const PageHeader = styled.div`
  padding: 26px 36px 20px;

  @media (max-width: 600px) {
    padding: 20px 20px 16px;
  }
`;

const PageTitle = styled.h1`
  font-family: var(--font-display-stack);
  font-weight: 900;
  font-size: 26px;
  color: var(--ink-primary);
  margin: 0 0 4px;
`;

const PageSubtitle = styled.p`
  font-style: italic;
  font-family: var(--font-body-stack);
  font-size: 14px;
  color: var(--ink-muted);
  margin: 0;
`;

const SelectorWrapper = styled.div`
  padding-top: 4px;
  padding-bottom: 16px;
`;

const Ribbon = styled.div`
  margin-top: 24px;
  padding: 0 36px;

  @media (max-width: 600px) {
    padding: 0 20px;
  }
`;

const GiltLine = styled.div`
  height: 2px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(201, 162, 75, 0.6) 6%,
    rgba(201, 162, 75, 0.6) 94%,
    transparent
  );
  margin-bottom: 18px;
`;

const CardRow = styled(motion.div)`
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 14px;
  scroll-behavior: smooth;

  /* Hide scrollbar on webkit while keeping functionality */
  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-track {
    background: var(--paper-deep);
  }
  &::-webkit-scrollbar-thumb {
    background: var(--rule-mid);
    border-radius: 2px;
  }
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HorizontalTimeline({
  installments,
  completedDates,
  initialDate,
  onDateSelect,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardRowRef = useRef<HTMLDivElement>(null);

  // Active date — driven by ?date= param, falling back to initialDate or first
  const paramDate = searchParams.get("date");
  const [activeDate, setActiveDate] = useState<string>(
    paramDate ?? initialDate ?? installments[0]?.date ?? "",
  );

  // Scroll the active card into view on mount and on change
  useEffect(() => {
    if (!cardRowRef.current || !activeDate) return;
    const card = cardRowRef.current.querySelector(`#card-${activeDate}`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeDate]);

  const selectDate = useCallback(
    (date: string) => {
      setActiveDate(date);
      onDateSelect?.(date);
      // Update URL param without full navigation
      const params = new URLSearchParams(searchParams.toString());
      params.set("date", date);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, onDateSelect],
  );

  const activeInstallment = installments.find((i) => i.date === activeDate) ?? null;

  // PacketPanel content placeholder — Sprint 4/6 will fill real content
  const packetContent: PacketContent | undefined = undefined;

  return (
    <Wrapper>
      <PageHeader>
        <PageTitle>The Season of 1844–46</PageTitle>
        <PageSubtitle>
          One hundred and thirty-nine installments · 1844–46
        </PageSubtitle>
      </PageHeader>

      <SelectorWrapper>
        <DateSelector
          installments={installments}
          activeDate={activeDate}
          onSelect={selectDate}
        />
      </SelectorWrapper>

      <Ribbon>
        <GiltLine />
        <CardRow ref={cardRowRef}>
          {installments.map((inst) => (
            <DayCard
              key={inst.date}
              installment={inst}
              isActive={inst.date === activeDate}
              isCompleted={completedDates.has(inst.date)}
              onClick={selectDate}
            />
          ))}
        </CardRow>
      </Ribbon>

      {activeInstallment && (
        <PacketPanel
          installment={activeInstallment}
          content={packetContent}
        />
      )}
    </Wrapper>
  );
}
