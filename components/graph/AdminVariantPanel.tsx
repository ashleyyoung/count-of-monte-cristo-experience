"use client";

/**
 * components/graph/AdminVariantPanel.tsx
 *
 * Admin-only panel (visible when adminMode is active) for:
 *  - Previewing all registered graph_variants side-by-side (or one at a time).
 *  - Publishing / unpublishing variants.
 *  - Setting the default variant.
 *
 * Renders inline above/below the graph on /debats — no modal required.
 * Write actions call server actions defined in app/actions/admin.ts (Sprint 6).
 * Until Sprint 6 exists, the panel renders but the action buttons are disabled with a note.
 */

import React, { useState, useTransition } from "react";
import styled from "styled-components";
import type { GraphPerson, GraphRelationship, LayoutOpts } from "@/lib/graph-layout";
import { NetworkGraph } from "./NetworkGraph";
import type { PersistedCoord } from "./NetworkGraph";

// Sprint 6 server-action module. Referenced via a variable specifier so this
// compiles and bundles before app/actions/admin.ts exists; resolved + feature-
// detected at runtime.
const ADMIN_ACTIONS_MODULE = "@/app/actions/admin";

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Panel = styled.div`
  border: 1px solid var(--gilt-warm);
  border-radius: 2px;
  background: var(--paper-card);
  padding: 1rem;
  margin-bottom: 1.5rem;
`;

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
`;

const PanelTitle = styled.h3`
  margin: 0;
  font-family: var(--font-labels-stack);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gilt-deep);
`;

const AdminBadge = styled.span`
  font-size: 0.65rem;
  background: var(--gilt-warm);
  color: var(--paper-base);
  padding: 0.1rem 0.4rem;
  border-radius: 2px;
  font-family: var(--font-labels-stack);
  letter-spacing: 0.05em;
  text-transform: uppercase;
`;

const VariantsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
`;

const VariantCard = styled.div<{ $isDefault: boolean; $published: boolean }>`
  border: 1px solid ${({ $isDefault }) => ($isDefault ? "var(--gilt-warm)" : "var(--rule-light)")};
  border-radius: 2px;
  overflow: hidden;
  opacity: ${({ $published }) => ($published ? 1 : 0.65)};
`;

const VariantCardHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--paper-deep);
  border-bottom: 1px solid var(--rule-light);
`;

const VariantName = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 0.78rem;
  color: var(--ink-secondary);
`;

const BadgeGroup = styled.div`
  display: flex;
  gap: 0.35rem;
`;

const StatusBadge = styled.span<{ $color: string }>`
  font-size: 0.65rem;
  padding: 0.1rem 0.4rem;
  border-radius: 2px;
  background: ${({ $color }) => $color};
  color: var(--paper-base);
  font-family: var(--font-labels-stack);
  text-transform: uppercase;
  letter-spacing: 0.04em;
`;

const GraphPreviewWrap = styled.div`
  height: 200px;
`;

const VariantCardFooter = styled.div`
  padding: 0.5rem 0.75rem;
  background: var(--paper-deep);
  border-top: 1px solid var(--rule-light);
  display: flex;
  gap: 0.5rem;
`;

const ActionBtn = styled.button<{ $variant?: "primary" | "danger" }>`
  flex: 1;
  padding: 0.3rem 0.5rem;
  font-family: var(--font-labels-stack);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border: 1px solid
    ${({ $variant }) =>
      $variant === "danger" ? "var(--oxblood)" : "var(--gilt-deep)"};
  background: transparent;
  color: ${({ $variant }) =>
    $variant === "danger" ? "var(--oxblood)" : "var(--gilt-deep)"};
  cursor: pointer;
  transition: background 0.12s, color 0.12s;

  &:hover:not(:disabled) {
    background: ${({ $variant }) =>
      $variant === "danger" ? "var(--oxblood)" : "var(--gilt-deep)"};
    color: var(--paper-base);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VariantRow {
  key: string;
  label: string;
  params: Record<string, unknown>;
  published: boolean;
  is_default: boolean;
  sort: number;
}

interface AdminVariantPanelProps {
  variants: VariantRow[];
  /** Persisted coordinates keyed by variant key */
  coordsByVariant: Record<string, PersistedCoord[]>;
  people: GraphPerson[];
  relationships: GraphRelationship[];
  opts?: Partial<LayoutOpts>;
  /** Called after any mutation to trigger a data refresh */
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminVariantPanel({
  variants,
  coordsByVariant,
  people,
  relationships,
  opts,
  onRefresh,
}: AdminVariantPanelProps) {
  const [, startTransition] = useTransition();
  const [actionState, setActionState] = useState<Record<string, "idle" | "loading" | "error">>(
    {},
  );

  async function callAction(
    variantKey: string,
    action: "publish" | "unpublish" | "setDefault",
  ) {
    setActionState((s) => ({ ...s, [variantKey]: "loading" }));
    try {
      // Sprint 6 will export these server actions.
      // Until then we show a notice.
      const mod = await import(ADMIN_ACTIONS_MODULE).catch(() => null);
      if (!mod) {
        alert("Admin write actions are wired in Sprint 6. Schema is ready.");
        setActionState((s) => ({ ...s, [variantKey]: "idle" }));
        return;
      }
      if (action === "publish") await mod.publishVariant(variantKey);
      else if (action === "unpublish") await mod.unpublishVariant(variantKey);
      else if (action === "setDefault") await mod.setDefaultVariant(variantKey);
      setActionState((s) => ({ ...s, [variantKey]: "idle" }));
      startTransition(() => onRefresh?.());
    } catch {
      setActionState((s) => ({ ...s, [variantKey]: "error" }));
    }
  }

  return (
    <Panel role="region" aria-label="Graph variant admin panel">
      <PanelHeader>
        <PanelTitle>Graph Layout Variants</PanelTitle>
        <AdminBadge>Admin</AdminBadge>
      </PanelHeader>

      <VariantsGrid>
        {variants.map((v) => {
          const coords = coordsByVariant[v.key] ?? [];
          const isLoading = actionState[v.key] === "loading";

          return (
            <VariantCard key={v.key} $isDefault={v.is_default} $published={v.published}>
              <VariantCardHeader>
                <VariantName>{v.label}</VariantName>
                <BadgeGroup>
                  {v.published && (
                    <StatusBadge $color="var(--rule-strong)">Published</StatusBadge>
                  )}
                  {v.is_default && (
                    <StatusBadge $color="var(--gilt-deep)">Default</StatusBadge>
                  )}
                </BadgeGroup>
              </VariantCardHeader>

              <GraphPreviewWrap>
                <NetworkGraph
                  people={people}
                  relationships={relationships}
                  coords={coords}
                  opts={opts}
                  labelMode="none"
                  width={300}
                  height={200}
                />
              </GraphPreviewWrap>

              <VariantCardFooter>
                {v.published ? (
                  <ActionBtn
                    $variant="danger"
                    disabled={isLoading}
                    onClick={() => callAction(v.key, "unpublish")}
                  >
                    Unpublish
                  </ActionBtn>
                ) : (
                  <ActionBtn
                    disabled={isLoading}
                    onClick={() => callAction(v.key, "publish")}
                  >
                    Publish
                  </ActionBtn>
                )}
                {!v.is_default && (
                  <ActionBtn
                    disabled={isLoading || !v.published}
                    onClick={() => callAction(v.key, "setDefault")}
                    title={!v.published ? "Publish the variant first" : undefined}
                  >
                    Set Default
                  </ActionBtn>
                )}
              </VariantCardFooter>
            </VariantCard>
          );
        })}
      </VariantsGrid>
    </Panel>
  );
}
