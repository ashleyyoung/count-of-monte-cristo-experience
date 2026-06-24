"use client";

import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { Installment } from "@/lib/installments";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PacketContent {
  feuilleton?: { title: string; subtitle: string };
  music?: { title: string; subtitle: string };
  theatre?: { title: string; subtitle: string };
  politics?: { title: string; subtitle: string };
  annonce?: { title: string; subtitle: string };
}

interface Props {
  installment: Installment;
  content?: PacketContent;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Panel = styled(motion.div)`
  margin: 22px 36px 0;
  border: 1px solid var(--rule-mid);
  background: var(--paper-feature);
  padding: 24px 28px;
  border-radius: 2px;
  overflow: hidden;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: baseline;
  gap: 16px;
  border-bottom: 1px solid var(--rule-light);
  padding-bottom: 12px;
  flex-wrap: wrap;
`;

const HeaderDate = styled.span`
  font-family: var(--font-display-stack);
  font-weight: 900;
  font-size: 24px;
  color: var(--gilt-deep);
`;

const HeaderChapter = styled.span`
  font-style: italic;
  font-family: var(--font-body-stack);
  font-size: 15px;
  color: var(--ink-secondary);
  flex: 1;
  min-width: 0;
`;

const HeaderAttribution = styled.span`
  font-family: ui-monospace, "Courier New", monospace;
  font-size: 11px;
  color: var(--ink-muted);
  margin-left: auto;
  white-space: nowrap;
`;

const MiniGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-top: 18px;

  @media (max-width: 900px) {
    grid-template-columns: repeat(3, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const MiniCard = styled.div`
  border: 1px solid var(--rule-light);
  background: var(--paper-card);
  padding: 12px;
  min-height: 140px;
`;

const MiniLabel = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--gilt-warm);
`;

const MiniTitle = styled.div`
  font-family: var(--font-display-stack);
  font-weight: 700;
  font-size: 15px;
  color: var(--ink-primary);
  margin-top: 6px;
  line-height: 1.25;
`;

const MiniSubtitle = styled.div`
  font-style: italic;
  font-size: 13px;
  color: var(--ink-muted);
  margin-top: 4px;
  line-height: 1.4;
`;

const EmptyHint = styled.div`
  font-style: italic;
  font-size: 11px;
  color: var(--rule-mid);
  margin-top: 10px;
`;

const CtaRow = styled.div`
  margin-top: 18px;
  display: flex;
  align-items: center;
  gap: 14px;
`;

const OpenCta = styled(Link)`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 15px;
  padding: 11px 26px;
  background: var(--ink-primary);
  color: var(--paper-card);
  text-decoration: none;
  border: 1px solid var(--ink-primary);
  display: inline-block;
  transition: background 0.15s, border-color 0.15s;

  &:hover {
    background: var(--oxblood);
    border-color: var(--oxblood);
    color: var(--paper-base);
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
}

// ---------------------------------------------------------------------------
// Slot definitions
// ---------------------------------------------------------------------------

const SLOTS = [
  { key: "feuilleton" as const, label: "FEUILLETON" },
  { key: "music" as const, label: "♪ MUSIC" },
  { key: "theatre" as const, label: "THEATRE" },
  { key: "politics" as const, label: "POLITICS" },
  { key: "annonce" as const, label: "ANNONCE" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PacketPanel({ installment, content }: Props) {
  const formatted = formatDate(installment.date);

  return (
    <AnimatePresence>
      <Panel
        key={installment.date}
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
      >
        {/* Header */}
        <PanelHeader>
          <HeaderDate>{formatted}</HeaderDate>
          <HeaderChapter>{installment.label}</HeaderChapter>
          <HeaderAttribution>Journal des Débats · {formatted}</HeaderAttribution>
        </PanelHeader>

        {/* 5 mini-cards */}
        <MiniGrid>
          {SLOTS.map(({ key, label }) => {
            const slot = content?.[key];
            return (
              <MiniCard key={key}>
                <MiniLabel>{label}</MiniLabel>
                {slot ? (
                  <>
                    <MiniTitle>{slot.title}</MiniTitle>
                    <MiniSubtitle>{slot.subtitle}</MiniSubtitle>
                  </>
                ) : (
                  <EmptyHint>Content forthcoming</EmptyHint>
                )}
              </MiniCard>
            );
          })}
        </MiniGrid>

        {/* CTA */}
        <CtaRow>
          <OpenCta href={`/day/${installment.date}`}>
            Open this day →
          </OpenCta>
        </CtaRow>
      </Panel>
    </AnimatePresence>
  );
}
