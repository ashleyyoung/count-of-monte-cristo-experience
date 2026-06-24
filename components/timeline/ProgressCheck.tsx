"use client";

import { useState } from "react";
import styled from "styled-components";
import Link from "next/link";

interface Props {
  date: string;
  isCompleted: boolean;
  isSignedIn: boolean;
  onToggle: (date: string, completed: boolean) => void;
}

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

const Checkbox = styled.button<{ $checked: boolean }>`
  width: 20px;
  height: 20px;
  border: 1.5px solid
    ${({ $checked }) => ($checked ? "var(--ink-tertiary)" : "var(--rule-mid)")};
  border-radius: 2px;
  background: ${({ $checked }) =>
    $checked ? "var(--ink-tertiary)" : "transparent"};
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  flex-shrink: 0;
  padding: 0;

  &:hover {
    border-color: var(--ink-secondary);
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }
`;

const Checkmark = styled.svg`
  width: 11px;
  height: 11px;
  color: var(--paper-base);
`;

const Prompt = styled.div`
  position: relative;
  display: inline-block;
`;

const PromptTooltip = styled.div`
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  width: 180px;
  background: var(--ink-primary);
  color: var(--paper-base);
  font-family: var(--font-labels-stack);
  font-style: italic;
  font-size: 11px;
  line-height: 1.5;
  padding: 8px 10px;
  border-radius: 2px;
  z-index: 20;
  white-space: normal;
  pointer-events: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);

  &::before {
    content: "";
    position: absolute;
    top: -4px;
    right: 6px;
    width: 8px;
    height: 8px;
    background: var(--ink-primary);
    transform: rotate(45deg);
  }

  a {
    color: var(--gilt-light);
    text-decoration: underline;
  }
`;

const AnonCheckbox = styled.button`
  width: 20px;
  height: 20px;
  border: 1.5px dashed var(--rule-mid);
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }
`;

const LockIcon = styled.span`
  font-size: 9px;
  color: var(--rule-mid);
  line-height: 1;
`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProgressCheck({
  date,
  isCompleted,
  isSignedIn,
  onToggle,
}: Props) {
  const [showPrompt, setShowPrompt] = useState(false);

  if (!isSignedIn) {
    return (
      <Prompt>
        <AnonCheckbox
          onClick={() => setShowPrompt((v) => !v)}
          title="Sign in to track progress"
          aria-label="Sign in to mark this installment complete"
        >
          <LockIcon>·</LockIcon>
        </AnonCheckbox>
        {showPrompt && (
          <PromptTooltip>
            <Link href="/login" onClick={() => setShowPrompt(false)}>
              Sign in
            </Link>{" "}
            to track your progress through the serialization.
          </PromptTooltip>
        )}
      </Prompt>
    );
  }

  return (
    <Checkbox
      $checked={isCompleted}
      onClick={() => onToggle(date, !isCompleted)}
      aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
      aria-checked={isCompleted}
      role="checkbox"
    >
      {isCompleted && (
        <Checkmark viewBox="0 0 11 11" fill="none" aria-hidden>
          <polyline
            points="2,5.5 4.5,8 9,3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Checkmark>
      )}
    </Checkbox>
  );
}
