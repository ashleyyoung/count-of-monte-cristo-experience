"use client";

/**
 * components/admin/primitives/FrenchTextPasteField.tsx
 *
 * Paste-in French source text (copied from Gallica's texteBrut or ALTO
 * endpoint in the admin's own browser) and write it straight to the matching
 * R2 key, bypassing the automated fetch entirely.
 */

import React, { useState, useTransition } from "react";
import styled from "styled-components";
import { uploadFrenchSourceText } from "@/app/actions/admin";

interface FrenchTextPasteFieldProps {
  date: string;
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const TierSelect = styled.select`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 4px 6px;
  border: 1px solid var(--rule-mid);
  background: var(--paper-feature);
  color: var(--ink-muted);
`;

const Textarea = styled.textarea`
  width: 100%;
  min-height: 80px;
  font-family: var(--font-mono-stack, monospace);
  font-size: 11px;
  padding: 6px 8px;
  border: 1px solid var(--rule-mid);
  background: var(--paper-feature);
  color: var(--ink);
  resize: vertical;
`;

const SubmitBtn = styled.button`
  align-self: flex-start;
  padding: 5px 12px;
  font-family: var(--font-labels-stack);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  border: 1px dashed var(--rule-mid);
  color: var(--ink-muted);
  cursor: pointer;
  background: var(--paper-feature);

  &:hover {
    border-color: var(--gilt-warm);
    color: var(--gilt-deep);
  }
  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`;

const StatusLine = styled.p`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.06em;
  color: var(--ink-muted);
  margin: 0;
`;

export default function FrenchTextPasteField({
  date,
}: FrenchTextPasteFieldProps) {
  const [tier, setTier] = useState<"textebrut" | "alto">("textebrut");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setStatus("Saving…");
    startTransition(async () => {
      try {
        const result = await uploadFrenchSourceText(date, tier, text);
        setStatus(`Saved ${result.char_count} chars → ${result.r2_key}`);
        setText("");
      } catch (err) {
        setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  return (
    <Wrapper>
      <Row>
        <TierSelect
          value={tier}
          onChange={(e) => setTier(e.target.value as "textebrut" | "alto")}
          disabled={isPending}
        >
          <option value="textebrut">texteBrut</option>
          <option value="alto">ALTO</option>
        </TierSelect>
        <SubmitBtn
          onClick={handleSubmit}
          disabled={isPending || text.trim().length === 0}
        >
          {isPending ? "Saving…" : "Save pasted text"}
        </SubmitBtn>
      </Row>
      <Textarea
        placeholder="Paste the texteBrut or ALTO content copied from Gallica here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isPending}
      />
      {status && <StatusLine>{status}</StatusLine>}
    </Wrapper>
  );
}
