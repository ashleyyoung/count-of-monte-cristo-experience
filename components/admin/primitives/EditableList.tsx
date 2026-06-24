"use client";

/**
 * components/admin/primitives/EditableList.tsx
 *
 * Generic drag-to-reorder list with per-item edit / delete affordances.
 * Uses @dnd-kit/sortable for accessible drag-and-drop.
 *
 * T must have an `id` string field used as the dnd-kit item id.
 */

import React, { useCallback } from "react";
import styled from "styled-components";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface EditableListItem {
  id: string;
}

interface EditableListProps<T extends EditableListItem> {
  items: T[];
  onReorder: (newItems: T[]) => void;
  onEdit: (item: T, index: number) => void;
  onDelete: (item: T, index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  addLabel?: string;
  onAdd?: () => void;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const ListWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const ItemRow = styled.div<{ $isDragging: boolean }>`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  background: var(--paper-base);
  border: 1px solid ${({ $isDragging }) => ($isDragging ? "var(--gilt-warm)" : "var(--rule-light)")};
  padding: 8px;
  opacity: ${({ $isDragging }) => ($isDragging ? 0.6 : 1)};
  transition: border-color 0.1s;
`;

const DragHandle = styled.span`
  color: var(--rule-mid);
  cursor: grab;
  padding: 2px 4px;
  font-size: 12px;
  flex-shrink: 0;
  align-self: center;
  user-select: none;
  &:active { cursor: grabbing; }
`;

const ItemContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const ItemControls = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex-shrink: 0;
`;

const ControlBtn = styled.button<{ $danger?: boolean }>`
  font-family: var(--font-labels-stack);
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 2px 6px;
  background: ${({ $danger }) => ($danger ? "rgba(180,40,30,0.08)" : "transparent")};
  color: ${({ $danger }) => ($danger ? "var(--oxblood)" : "var(--ink-muted)")};
  border: 1px solid ${({ $danger }) => ($danger ? "rgba(180,40,30,0.25)" : "var(--rule-light)")};
  cursor: pointer;
  line-height: 1.7;
  transition: background 0.1s, color 0.1s;

  &:hover {
    background: ${({ $danger }) => ($danger ? "rgba(180,40,30,0.15)" : "var(--paper-deep)")};
    color: ${({ $danger }) => ($danger ? "var(--oxblood)" : "var(--ink-primary)")};
    border-color: ${({ $danger }) => ($danger ? "var(--oxblood)" : "var(--ink-muted)")};
  }
`;

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
  padding: 6px 10px;
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

// ---------------------------------------------------------------------------
// Sortable item wrapper
// ---------------------------------------------------------------------------

function SortableItem<T extends EditableListItem>({
  item,
  index,
  onEdit,
  onDelete,
  renderItem,
}: {
  item: T;
  index: number;
  onEdit: (item: T, index: number) => void;
  onDelete: (item: T, index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <ItemRow ref={setNodeRef} style={style} $isDragging={isDragging}>
      <DragHandle {...attributes} {...listeners} aria-label="Drag to reorder">⣿</DragHandle>
      <ItemContent>{renderItem(item, index)}</ItemContent>
      <ItemControls>
        <ControlBtn onClick={() => onEdit(item, index)}>Edit</ControlBtn>
        <ControlBtn $danger onClick={() => onDelete(item, index)}>Delete</ControlBtn>
      </ItemControls>
    </ItemRow>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EditableList<T extends EditableListItem>({
  items,
  onReorder,
  onEdit,
  onDelete,
  renderItem,
  addLabel = "Add item",
  onAdd,
}: EditableListProps<T>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = items.findIndex((it) => it.id === active.id);
      const newIndex = items.findIndex((it) => it.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(arrayMove(items, oldIndex, newIndex));
      }
    },
    [items, onReorder],
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((it) => it.id)} strategy={verticalListSortingStrategy}>
        <ListWrapper>
          {items.map((item, i) => (
            <SortableItem
              key={item.id}
              item={item}
              index={i}
              onEdit={onEdit}
              onDelete={onDelete}
              renderItem={renderItem}
            />
          ))}
        </ListWrapper>
      </SortableContext>
      {onAdd && (
        <AddBtn onClick={onAdd}>⊕ {addLabel}</AddBtn>
      )}
    </DndContext>
  );
}
