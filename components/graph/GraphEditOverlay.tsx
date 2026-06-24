"use client";

/**
 * components/graph/GraphEditOverlay.tsx
 *
 * Admin-mode overlay enabling:
 *  1. Add Person — full person fields + connections repeater.
 *  2. Edit/delete edge metadata inline on the graph.
 *
 * Wires to Sprint 6 server action: app/actions/admin.ts → upsertPersonWithRelationships()
 * which also calls recomputeGraphLayout() and triggers router.refresh().
 *
 * Until Sprint 6 is implemented, the action stubs return helpful errors rather than silently failing.
 */

import React, {
  useState,
  useTransition,
} from "react";
import styled from "styled-components";
import { useRouter } from "next/navigation";
import type { GraphPerson, GraphRelationship } from "@/lib/graph-layout";

// Sprint 6 server-action module. Referenced via a variable specifier so this
// component compiles and the bundle builds before app/actions/admin.ts exists;
// at runtime the import is feature-detected and degrades gracefully until then.
const ADMIN_ACTIONS_MODULE = "@/app/actions/admin";

// ---------------------------------------------------------------------------
// Styled primitives
// ---------------------------------------------------------------------------

const Overlay = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
`;

const AddNodeBtn = styled.button`
  position: absolute;
  bottom: 12px;
  right: 12px;
  pointer-events: all;
  padding: 0.4rem 0.8rem;
  background: var(--paper-deep);
  border: 1px solid var(--gilt-warm);
  color: var(--gilt-deep);
  font-family: var(--font-labels-stack);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  border-radius: 2px;
  transition: background 0.12s, color 0.12s;

  &:hover {
    background: var(--gilt-warm);
    color: var(--paper-base);
  }
`;

const Drawer = styled.div<{ $open: boolean }>`
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 420px;
  max-width: 96vw;
  background: var(--paper-base);
  border-left: 2px solid var(--gilt-warm);
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
  transform: translateX(${({ $open }) => ($open ? "0" : "100%")});
  transition: transform 0.22s ease;
  overflow-y: auto;
  z-index: 200;
  pointer-events: all;
`;

const DrawerHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--rule-light);
`;

const DrawerTitle = styled.h2`
  margin: 0;
  font-family: var(--font-display-stack);
  font-size: 1.1rem;
  color: var(--ink-primary);
`;

const CloseBtn = styled.button`
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: var(--ink-muted);
  padding: 0.2rem 0.4rem;
  &:hover { color: var(--ink-primary); }
`;

const DrawerBody = styled.div`
  padding: 1rem 1.25rem;
`;

const FieldGroup = styled.div`
  margin-bottom: 1rem;
`;

const FieldLabel = styled.label`
  display: block;
  font-family: var(--font-labels-stack);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-muted);
  margin-bottom: 0.3rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--rule-light);
  background: var(--paper-card);
  color: var(--ink-primary);
  font-family: var(--font-body-stack);
  font-size: 0.875rem;
  border-radius: 2px;

  &:focus {
    outline: none;
    border-color: var(--gilt-warm);
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--rule-light);
  background: var(--paper-card);
  color: var(--ink-primary);
  font-family: var(--font-body-stack);
  font-size: 0.875rem;
  border-radius: 2px;

  &:focus {
    outline: none;
    border-color: var(--gilt-warm);
  }
`;

const Textarea = styled.textarea`
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--rule-light);
  background: var(--paper-card);
  color: var(--ink-primary);
  font-family: var(--font-body-stack);
  font-size: 0.875rem;
  border-radius: 2px;
  resize: vertical;
  min-height: 70px;

  &:focus {
    outline: none;
    border-color: var(--gilt-warm);
  }
`;

const SectionHeading = styled.h3`
  font-family: var(--font-labels-stack);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--gilt-deep);
  margin: 1.25rem 0 0.6rem;
  border-bottom: 1px solid var(--rule-light);
  padding-bottom: 0.3rem;
`;

const ConnectionRow = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.5rem;
`;

const RemoveBtn = styled.button`
  background: none;
  border: 1px solid var(--oxblood);
  color: var(--oxblood);
  font-size: 0.7rem;
  padding: 0.25rem 0.4rem;
  cursor: pointer;
  border-radius: 2px;
  &:hover { background: var(--oxblood); color: var(--paper-base); }
`;

const AddConnectionBtn = styled.button`
  background: none;
  border: 1px dashed var(--rule-mid);
  color: var(--ink-muted);
  font-family: var(--font-labels-stack);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  border-radius: 2px;
  width: 100%;
  margin-top: 0.25rem;
  transition: border-color 0.1s, color 0.1s;

  &:hover { border-color: var(--gilt-warm); color: var(--gilt-deep); }
`;

const SubmitBtn = styled.button`
  width: 100%;
  padding: 0.6rem;
  background: var(--ink-primary);
  color: var(--paper-base);
  border: none;
  font-family: var(--font-labels-stack);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  cursor: pointer;
  border-radius: 2px;
  margin-top: 1.5rem;
  transition: background 0.12s;

  &:hover:not(:disabled) { background: var(--ink-secondary); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ErrorMsg = styled.p`
  color: var(--oxblood);
  font-size: 0.8rem;
  margin-top: 0.5rem;
`;

const SuccessMsg = styled.p`
  color: var(--rule-strong);
  font-size: 0.8rem;
  margin-top: 0.5rem;
`;

// Edge edit popover (appears on hover over an edge)
const EdgePopover = styled.div<{ $x: number; $y: number }>`
  position: fixed;
  top: ${({ $y }) => $y}px;
  left: ${({ $x }) => $x}px;
  background: var(--paper-base);
  border: 1px solid var(--gilt-warm);
  border-radius: 2px;
  padding: 0.5rem 0.75rem;
  font-family: var(--font-labels-stack);
  font-size: 0.72rem;
  z-index: 300;
  pointer-events: all;
  min-width: 160px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
`;

const EdgeAction = styled.button`
  display: block;
  width: 100%;
  background: none;
  border: none;
  color: var(--ink-secondary);
  text-align: left;
  padding: 0.2rem 0;
  cursor: pointer;
  font-family: var(--font-labels-stack);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;

  &:hover { color: var(--gilt-deep); }
  &.danger { color: var(--oxblood); }
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectionEntry {
  targetSlug: string;
  kind: string;
  label: string;
  source: string;
}

interface AddPersonForm {
  name: string;
  slug: string;
  category: GraphPerson["category"];
  beat: string;
  birth_year: string;
  death_year: string;
  bio: string;
  connections: ConnectionEntry[];
}

const EMPTY_FORM: AddPersonForm = {
  name: "",
  slug: "",
  category: "figure",
  beat: "",
  birth_year: "",
  death_year: "",
  bio: "",
  connections: [],
};

// Matches the relationships.kind check constraint in the schema.
const RELATIONSHIP_KINDS = [
  "family",
  "romantic",
  "friend",
  "rival",
  "mentor",
  "collaborator",
  "patron",
  "royalty",
  "professional",
];

export interface EdgeEditTarget {
  rel: GraphRelationship;
  x: number;
  y: number;
}

interface GraphEditOverlayProps {
  people: GraphPerson[];
  /** Reserved for inline edge editing (Sprint 6); not consumed by the add-person flow. */
  relationships: GraphRelationship[];
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GraphEditOverlay({ people, onRefresh }: GraphEditOverlayProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<AddPersonForm>(EMPTY_FORM);
  const [edgeTarget, setEdgeTarget] = useState<EdgeEditTarget | null>(null);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Derived: auto-slug from name
  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setForm((f) => ({ ...f, name, slug }));
  };

  const addConnection = () => {
    setForm((f) => ({
      ...f,
      connections: [
        ...f.connections,
        { targetSlug: "", kind: "professional", label: "", source: "" },
      ],
    }));
  };

  const updateConnection = (idx: number, patch: Partial<ConnectionEntry>) => {
    setForm((f) => {
      const connections = [...f.connections];
      connections[idx] = { ...connections[idx], ...patch };
      return { ...f, connections };
    });
  };

  const removeConnection = (idx: number) => {
    setForm((f) => ({
      ...f,
      connections: f.connections.filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      setErrorMsg("Name and slug are required.");
      setStatus("error");
      return;
    }
    setStatus("idle");
    setErrorMsg("");

    try {
      // Sprint 6 exports upsertPersonWithRelationships. Resolved via a variable
      // specifier so this compiles before app/actions/admin.ts exists.
      const mod = await import(ADMIN_ACTIONS_MODULE).catch(() => null);
      if (!mod || !mod.upsertPersonWithRelationships) {
        setErrorMsg("Admin write actions are wired in Sprint 6. Schema is ready.");
        setStatus("error");
        return;
      }
      await mod.upsertPersonWithRelationships({
        name: form.name.trim(),
        slug: form.slug.trim(),
        category: form.category,
        beat: form.beat.trim() || null,
        birth_year: form.birth_year ? parseInt(form.birth_year, 10) : null,
        death_year: form.death_year ? parseInt(form.death_year, 10) : null,
        bio: form.bio.trim() || null,
        connections: form.connections
          .filter((c) => c.targetSlug.trim())
          .map((c) => ({
            targetSlug: c.targetSlug.trim(),
            kind: c.kind,
            label: c.label.trim() || undefined,
            source: c.source.trim() || undefined,
          })),
      });
      setStatus("success");
      setForm(EMPTY_FORM);
      startTransition(() => {
        onRefresh?.();
        router.refresh();
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred.");
      setStatus("error");
    }
  };

  const handleDeleteEdge = async (rel: GraphRelationship) => {
    setEdgeTarget(null);
    try {
      const mod = await import(ADMIN_ACTIONS_MODULE).catch(() => null);
      if (!mod?.deleteRelationship) {
        alert("Edge deletion is wired in Sprint 6.");
        return;
      }
      await mod.deleteRelationship(rel.from_person, rel.to_person, rel.kind);
      startTransition(() => { onRefresh?.(); router.refresh(); });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete edge.");
    }
  };

  return (
    <>
      {/* Overlay button to open add-person drawer */}
      <Overlay>
        <AddNodeBtn onClick={() => setDrawerOpen(true)} aria-label="Add person to graph">
          + Add Person
        </AddNodeBtn>
      </Overlay>

      {/* Add person drawer */}
      <Drawer $open={drawerOpen} role="dialog" aria-label="Add person to graph" aria-modal="true">
        <DrawerHeader>
          <DrawerTitle>Add Person</DrawerTitle>
          <CloseBtn onClick={() => setDrawerOpen(false)} aria-label="Close">×</CloseBtn>
        </DrawerHeader>

        <DrawerBody>
          <FieldGroup>
            <FieldLabel htmlFor="geo-name">Name</FieldLabel>
            <Input
              id="geo-name"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Théophile Gautier"
            />
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="geo-slug">Slug</FieldLabel>
            <Input
              id="geo-slug"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="e.g. theophile-gautier"
            />
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="geo-category">Category</FieldLabel>
            <Select
              id="geo-category"
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value as GraphPerson["category"] }))
              }
            >
              <option value="contributor">Contributor (Journal des Débats)</option>
              <option value="figure">Historical Figure</option>
              <option value="royalty">Royalty / Ruler</option>
            </Select>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="geo-beat">Beat / Domain</FieldLabel>
            <Input
              id="geo-beat"
              value={form.beat}
              onChange={(e) => setForm((f) => ({ ...f, beat: e.target.value }))}
              placeholder="e.g. literature, science, politics"
            />
          </FieldGroup>

          <FieldGroup>
            <FieldLabel>Life Dates</FieldLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
              <Input
                value={form.birth_year}
                onChange={(e) => setForm((f) => ({ ...f, birth_year: e.target.value }))}
                placeholder="Born (year)"
                type="number"
              />
              <Input
                value={form.death_year}
                onChange={(e) => setForm((f) => ({ ...f, death_year: e.target.value }))}
                placeholder="Died (year)"
                type="number"
              />
            </div>
          </FieldGroup>

          <FieldGroup>
            <FieldLabel htmlFor="geo-bio">Short Bio</FieldLabel>
            <Textarea
              id="geo-bio"
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              placeholder="One-paragraph biography…"
            />
          </FieldGroup>

          <SectionHeading>Connections</SectionHeading>
          <p style={{ fontSize: "0.78rem", color: "var(--ink-muted)", marginTop: 0 }}>
            List existing people this person connects to. Placement is computed automatically.
          </p>

          {form.connections.map((conn, idx) => (
            <div key={idx}>
              <ConnectionRow>
                <Select
                  value={conn.targetSlug}
                  onChange={(e) => updateConnection(idx, { targetSlug: e.target.value })}
                  aria-label="Connected person"
                >
                  <option value="">— Select person —</option>
                  {[...people]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((p) => (
                      <option key={p.id} value={p.slug}>
                        {p.name}
                      </option>
                    ))}
                </Select>
                <Select
                  value={conn.kind}
                  onChange={(e) => updateConnection(idx, { kind: e.target.value })}
                  aria-label="Relationship kind"
                >
                  {RELATIONSHIP_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </Select>
                <RemoveBtn onClick={() => removeConnection(idx)} aria-label="Remove connection">
                  ×
                </RemoveBtn>
              </ConnectionRow>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginBottom: "0.5rem" }}>
                <Input
                  value={conn.label}
                  onChange={(e) => updateConnection(idx, { label: e.target.value })}
                  placeholder="Relationship label (opt.)"
                />
                <Input
                  value={conn.source}
                  onChange={(e) => updateConnection(idx, { source: e.target.value })}
                  placeholder="Source URL (opt.)"
                />
              </div>
            </div>
          ))}

          <AddConnectionBtn onClick={addConnection}>+ Add Connection</AddConnectionBtn>

          {status === "error" && <ErrorMsg>{errorMsg}</ErrorMsg>}
          {status === "success" && <SuccessMsg>Person added. Graph is recomputing.</SuccessMsg>}

          <SubmitBtn onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Saving…" : "Save Person"}
          </SubmitBtn>
        </DrawerBody>
      </Drawer>

      {/* Edge edit popover */}
      {edgeTarget && (
        <EdgePopover $x={edgeTarget.x} $y={edgeTarget.y}>
          <div style={{ marginBottom: "0.35rem", color: "var(--ink-muted)" }}>
            {edgeTarget.rel.kind}
          </div>
          <EdgeAction onClick={() => setEdgeTarget(null)}>Edit (Sprint 6)</EdgeAction>
          <EdgeAction
            className="danger"
            onClick={() => handleDeleteEdge(edgeTarget.rel)}
          >
            Delete edge
          </EdgeAction>
          <EdgeAction onClick={() => setEdgeTarget(null)}>Cancel</EdgeAction>
        </EdgePopover>
      )}
    </>
  );
}
