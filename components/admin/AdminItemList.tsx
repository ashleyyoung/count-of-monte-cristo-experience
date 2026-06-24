"use client";

/**
 * components/admin/AdminItemList.tsx
 *
 * Wraps a day-section item list with admin affordances:
 *  - Drag-to-reorder via EditableList / dnd-kit
 *  - Per-item Edit (opens ItemEditor) and Delete
 *  - "+ Add" button at the foot of each section
 *
 * In reader mode (adminMode off) renders items via renderItems exactly as before.
 */

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAdminMode } from "@/components/admin/AdminModeProvider";
import EditableList from "@/components/admin/primitives/EditableList";
import ItemEditor from "@/components/admin/primitives/ItemEditor";
import {
  deleteDayContentItem,
  reorderDayContentItems,
} from "@/app/actions/admin";
import type { DayContentSection } from "@/lib/types/day-content-section";
import { renderItems, type AdminItemContext } from "@/components/day/TabPrimitives";
import type { ResolvedDocItem } from "@/lib/content";
import type { DocItem } from "@/lib/types/content";
import type { ContributorInfo } from "@/components/day/ContributorByline";
import styled from "styled-components";

interface AdminItemListProps {
  date: string;
  section: DayContentSection;
  /** Raw DocItem array (from DayPageData.doc) for index-based ops. */
  rawItems: DocItem[];
  /** Resolved items (from DayPageData.resolved) for display. */
  resolvedItems: ResolvedDocItem[];
  contributors?: Map<string, ContributorInfo>;
  emptyMessage?: React.ReactNode;
  /** When showing a single-item slice, the real index in the section array. */
  sectionItemIndex?: number;
  /** When provided, shows the TranslationHistory pill on text items in admin mode. */
  adminItemContext?: Omit<AdminItemContext, "section">;
}

// Shim resolved item text for the edit form pre-population.
// Sprint 9 will thread the R2 text through here when it adds text-body preloading.
function getExistingTextBody(): string {
  return "";
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  padding: 7px 12px;
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  background: transparent;
  color: var(--gilt-deep);
  border: 1px dashed var(--gilt-warm);
  cursor: pointer;
  transition: background 0.12s;
  &:hover { background: rgba(201,162,75,0.08); }
`;

const ItemSummary = styled.div`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  text-transform: uppercase;
  padding: 2px 0;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminItemList({
  date,
  section,
  rawItems,
  resolvedItems,
  contributors,
  emptyMessage,
  sectionItemIndex,
  adminItemContext,
}: AdminItemListProps) {
  const { adminMode } = useAdminMode();
  const router = useRouter();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | undefined>(undefined);
  const [editingItem, setEditingItem] = useState<DocItem | undefined>(undefined);
  const [editingTextBody, setEditingTextBody] = useState<string>("");
  // Bumped on every open so ItemEditor remounts with fresh initial state,
  // even when re-editing the same index after a refresh.
  const [editNonce, setEditNonce] = useState(0);

  // Wrap raw items with stable id for dnd-kit
  const listItems = rawItems.map((item, i) => ({ ...item, id: String(i) }));
  type ListItem = typeof listItems[number];

  const handleEdit = useCallback((_listItem: ListItem, index: number) => {
    const realIndex = sectionItemIndex ?? index;
    setEditingItem(rawItems[index]);
    setEditingIndex(realIndex);
    setEditingTextBody(getExistingTextBody());
    setEditNonce((n) => n + 1);
    setEditorOpen(true);
  }, [rawItems, sectionItemIndex]);

  const handleDelete = useCallback(
    async (_listItem: ListItem, index: number) => {
      const realIndex = sectionItemIndex ?? index;
      if (!confirm(`Delete item ${realIndex + 1} from "${section}"?`)) return;
      try {
        await deleteDayContentItem(date, section, realIndex);
        router.refresh();
      } catch (err) {
        alert(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [date, section, router, sectionItemIndex],
  );

  const handleReorder = useCallback(
    async (newListItems: ListItem[]) => {
      // Map from new list order back to raw DocItem order
      const newRawItems = newListItems.map((it) => {
        const origIndex = parseInt(it.id, 10);
        return rawItems[origIndex];
      });
      try {
        await reorderDayContentItems(date, section, newRawItems);
        router.refresh();
      } catch (err) {
        alert(`Reorder failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [rawItems, date, section, router],
  );

  const renderListItem = useCallback(
    (_listItem: ListItem, index: number) => {
      const resolved = resolvedItems[index];
      if (!resolved) return <ItemSummary>Item {index + 1}</ItemSummary>;
      if (resolved.kind === "text") {
        return (
          <ItemSummary>
            {resolved.kind.toUpperCase()} · {resolved.source} · {resolved.original_date}
          </ItemSummary>
        );
      }
      if (resolved.kind === "image") {
        return <ItemSummary>{resolved.kind.toUpperCase()} · {resolved.caption || "(no caption)"}</ItemSummary>;
      }
      if (resolved.kind === "audio") {
        return <ItemSummary>{resolved.kind.toUpperCase()} · {resolved.work_title} — {resolved.composer}</ItemSummary>;
      }
      return <ItemSummary>Item {index + 1}</ItemSummary>;
    },
    [resolvedItems],
  );

  // Reader view: pass adminContext so history pills render when adminMode toggles on
  if (!adminMode) {
    const ctx: AdminItemContext | undefined = adminItemContext
      ? { ...adminItemContext, section }
      : undefined;
    return (
      <>
        {resolvedItems.length > 0
          ? renderItems(resolvedItems, contributors, ctx)
          : (emptyMessage ?? null)}
      </>
    );
  }

  // Admin view: drag-reorder list + add button + item editor
  const adminCtx: AdminItemContext | undefined = adminItemContext
    ? { ...adminItemContext, section }
    : undefined;

  return (
    <>
      {/* Existing items as drag-reorder list */}
      {rawItems.length > 0 ? (
        <EditableList
          items={listItems}
          onReorder={handleReorder}
          onEdit={handleEdit}
          onDelete={handleDelete}
          renderItem={renderListItem}
        />
      ) : (
        emptyMessage && <div style={{ opacity: 0.5 }}>{emptyMessage}</div>
      )}

      <AddBtn onClick={() => { setEditingItem(undefined); setEditingIndex(undefined); setEditingTextBody(""); setEditNonce((n) => n + 1); setEditorOpen(true); }}>
        ⊕ Add item
      </AddBtn>

      {/* Reading view with translation history pills — shown below the edit controls */}
      {adminCtx && resolvedItems.length > 0 && (
        <div style={{ marginTop: 20, borderTop: "1px solid var(--rule-light)", paddingTop: 16 }}>
          {renderItems(resolvedItems, contributors, adminCtx)}
        </div>
      )}

      <ItemEditor
        key={editNonce}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        date={date}
        section={section}
        existingItem={editingItem}
        existingTextBody={editingTextBody}
        existingItemIndex={editingIndex}
      />
    </>
  );
}
