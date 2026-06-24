"use client";

import styled from "styled-components";

export type TimelineView = "horizontal" | "vertical";

interface Props {
  view: TimelineView;
  onChange: (v: TimelineView) => void;
}

const Pill = styled.div`
  display: inline-flex;
  border: 1px solid var(--rule-mid);
  border-radius: 3px;
  overflow: hidden;
  background: var(--paper-card);
`;

const Option = styled.button<{ $active: boolean }>`
  padding: 6px 18px;
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 12px;
  letter-spacing: 0.1em;
  background: ${({ $active }) => ($active ? "var(--ink-primary)" : "transparent")};
  color: ${({ $active }) => ($active ? "var(--paper-base)" : "var(--ink-tertiary)")};
  border: none;
  border-right: 1px solid var(--rule-light);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;

  &:last-child {
    border-right: none;
  }

  &:hover:not([aria-pressed="true"]) {
    background: var(--paper-feature);
    color: var(--ink-primary);
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: -2px;
  }
`;

export default function ViewToggle({ view, onChange }: Props) {
  return (
    <Pill role="group" aria-label="Timeline view">
      <Option
        $active={view === "horizontal"}
        aria-pressed={view === "horizontal"}
        onClick={() => onChange("horizontal")}
      >
        Period view
      </Option>
      <Option
        $active={view === "vertical"}
        aria-pressed={view === "vertical"}
        onClick={() => onChange("vertical")}
      >
        Scroll view
      </Option>
    </Pill>
  );
}
