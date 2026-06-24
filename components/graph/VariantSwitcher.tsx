"use client";

/**
 * components/graph/VariantSwitcher.tsx
 *
 * Public-facing switcher shown on /debats when more than one published variant exists.
 * Calls onVariantChange with the selected variant key.
 */

import React from "react";
import styled from "styled-components";

const SwitcherRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0;
`;

const Label = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 0.75rem;
  color: var(--ink-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
`;

const Pill = styled.button<{ $active: boolean }>`
  padding: 0.2rem 0.65rem;
  border-radius: 20px;
  border: 1px solid ${({ $active }) => ($active ? "var(--gilt-warm)" : "var(--rule-light)")};
  background: ${({ $active }) => ($active ? "var(--gilt-warm)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--paper-base)" : "var(--ink-muted)")};
  font-family: var(--font-labels-stack);
  font-size: 0.72rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;

  &:hover {
    border-color: var(--gilt-warm);
    color: ${({ $active }) => ($active ? "var(--paper-base)" : "var(--gilt-warm)")};
  }
`;

export interface VariantOption {
  key: string;
  label: string;
}

interface VariantSwitcherProps {
  variants: VariantOption[];
  activeKey: string;
  onVariantChange: (key: string) => void;
}

export function VariantSwitcher({ variants, activeKey, onVariantChange }: VariantSwitcherProps) {
  if (variants.length <= 1) return null;
  return (
    <SwitcherRow aria-label="Graph layout variant">
      <Label>View</Label>
      {variants.map((v) => (
        <Pill
          key={v.key}
          $active={v.key === activeKey}
          onClick={() => onVariantChange(v.key)}
          aria-pressed={v.key === activeKey}
        >
          {v.label}
        </Pill>
      ))}
    </SwitcherRow>
  );
}
