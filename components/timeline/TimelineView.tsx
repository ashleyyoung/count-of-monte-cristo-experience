"use client";

/**
 * TimelineView — client shell that owns view state, progress mutations,
 * and the ViewToggle. Receives initial data from the server page.
 */

import { useCallback, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styled from "styled-components";
import BreadcrumbBar from "@/components/ui/BreadcrumbBar";
import type { Installment } from "@/lib/installments";
import type { SchedulePart } from "@/lib/installments";
import ViewToggle, { type TimelineView } from "@/components/timeline/ViewToggle";
import HorizontalTimeline from "@/components/timeline/HorizontalTimeline";
import VerticalTimeline from "@/components/timeline/VerticalTimeline";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import EditableText from "@/components/admin/primitives/EditableText";
import { upsertEditorialBlock } from "@/app/actions/admin";

interface Props {
  installments: Installment[];
  parts: Omit<SchedulePart, "installments">[];
  initialView: TimelineView;
  initialCompletedDates: string[];
  initialLastLocation: string | null;
  isSignedIn: boolean;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Shell = styled.div`
  min-height: 100vh;
  background: var(--paper-base);
`;

const Nav = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 36px;
  border-bottom: 1px solid var(--rule-light);
  background: var(--paper-card);
  position: sticky;
  top: 0;
  z-index: 10;

  @media (max-width: 600px) {
    padding: 12px 20px;
  }
`;

const NavTitle = styled.span`
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-muted);
  letter-spacing: 0.06em;
`;

const AdminIntroBar = styled.div`
  padding: 8px 36px;
  background: rgba(201,162,75,0.06);
  border-bottom: 1px dashed var(--gilt-warm);
  display: flex;
  align-items: center;
  gap: 10px;

  @media (max-width: 600px) { padding: 8px 20px; }
`;

const AdminIntroNote = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TimelineView({
  installments,
  parts,
  initialView,
  initialCompletedDates,
  initialLastLocation,
  isSignedIn,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const { adminMode } = useAdminMode();

  const [view, setView] = useState<TimelineView>(initialView);
  const [completedDates, setCompletedDates] = useState<Set<string>>(
    new Set(initialCompletedDates),
  );

  // Persist view preference via server action route (fire-and-forget)
  const handleViewChange = useCallback(
    (v: TimelineView) => {
      setView(v);
      // Preserve date param when switching views
      const params = new URLSearchParams(searchParams.toString());
      if (v === "vertical") {
        params.delete("date");
      }
      startTransition(() => {
        router.replace(`/timeline?${params.toString()}`, { scroll: false });
      });
      // Persist preference
      fetch("/api/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewPref: v }),
      }).catch(() => {});
    },
    [router, searchParams],
  );

  // Toggle completion and persist
  const handleToggleComplete = useCallback(
    (date: string, completed: boolean) => {
      setCompletedDates((prev) => {
        const next = new Set(prev);
        if (completed) {
          next.add(date);
        } else {
          next.delete(date);
        }
        return next;
      });
      fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, completed }),
      }).catch(() => {});
    },
    [],
  );

  // Update last_location when a date is selected in horizontal view
  const handleDateSelect = useCallback((date: string) => {
    fetch("/api/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastLocation: date }),
    }).catch(() => {});
  }, []);

  return (
    <Shell>
      <Nav>
        <BreadcrumbBar
          crumbs={[
            { label: "Journal des Débats", href: "/" },
            { label: "Timeline" },
          ]}
        />
        <NavTitle>1844–46</NavTitle>
        <ViewToggle view={view} onChange={handleViewChange} />
      </Nav>

      {adminMode && (
        <AdminIntroBar>
          <EditableText
            value=""
            onSave={async (text) => {
              await upsertEditorialBlock("timeline-intro", "Timeline intro", text);
              router.refresh();
            }}
            placeholder="Write a short intro for the timeline landing (markdown)…"
          >
            <AdminIntroNote>✎ Timeline editorial intro — click Edit to add/update (written to editorial_blocks.timeline-intro; Sprint 10 wires the read path).</AdminIntroNote>
          </EditableText>
        </AdminIntroBar>
      )}

      {view === "horizontal" ? (
        <HorizontalTimeline
          installments={installments}
          completedDates={completedDates}
          initialDate={initialLastLocation}
          onDateSelect={handleDateSelect}
        />
      ) : (
        <VerticalTimeline
          installments={installments}
          parts={parts}
          completedDates={completedDates}
          initialScrollDate={initialLastLocation}
          onToggleComplete={handleToggleComplete}
          isSignedIn={isSignedIn}
        />
      )}
    </Shell>
  );
}
