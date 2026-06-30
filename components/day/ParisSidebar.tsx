"use client";

/**
 * "On this day" — a slim orientation rail beside the chapter and "Paris, that
 * day". It no longer duplicates section content (that now lives in the "Paris,
 * that day" tab); it carries the dateline and the cast of figures who appear in
 * the morning's paper, each linking to a profile via the shared hover card.
 */

import styled from "styled-components";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import type { ContributorInfo } from "./ContributorByline";
import PersonHoverCard from "@/components/people/PersonHoverCard";

interface Props {
  date: string;
  figures: ContributorInfo[];
}

const Sidebar = styled.aside`
  background: var(--paper-card);
  border-left: 1px solid var(--rule-mid);
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: auto;
  min-width: 0;
`;

const SectionHeading = styled.h3`
  font-family: var(--font-display-stack);
  font-style: italic;
  font-size: 15px;
  font-weight: 400;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--gilt-warm);
  margin: 0 0 10px;
`;

const Dateline = styled.div`
  font-family: var(--font-display-stack);
  font-size: 16px;
  line-height: 1.35;
  color: var(--ink-primary);
`;

const Weekday = styled.div`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-muted);
  margin-bottom: 4px;
`;

const FigureList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const FigureItem = styled.li`
  font-family: var(--font-body-stack);
  font-size: 14px;
  line-height: 1.4;
  color: var(--ink-secondary);
`;

const FigureRole = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  color: var(--ink-muted);
`;

const Empty = styled.p`
  font-family: var(--font-body-stack);
  font-style: italic;
  font-size: 12px;
  color: var(--ink-muted);
  margin: 0;
`;

const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDateline(iso: string): { weekday: string; full: string } {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return { weekday, full: `${MONTHS[m - 1]} ${d}, ${y}` };
}

export default function ParisSidebar({ date, figures }: Props) {
  const { adminMode } = useAdminMode();
  const { weekday, full } = formatDateline(date);
  const showFigures = figures.length > 0 || adminMode;

  return (
    <Sidebar>
      <div>
        <SectionHeading>On this day</SectionHeading>
        <Weekday>{weekday}</Weekday>
        <Dateline>{full}</Dateline>
      </div>

      {showFigures && (
        <div>
          <SectionHeading>Figures in today&rsquo;s paper</SectionHeading>
          {figures.length > 0 ? (
            <FigureList>
              {figures.map((f) => (
                <FigureItem key={f.id}>
                  <PersonHoverCard person={f} />
                  {f.role && <FigureRole> · {f.role}</FigureRole>}
                </FigureItem>
              ))}
            </FigureList>
          ) : (
            <Empty>No bylined figures recovered for this issue yet.</Empty>
          )}
        </div>
      )}
    </Sidebar>
  );
}
