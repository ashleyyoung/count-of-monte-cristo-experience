"use client";

import styled from "styled-components";
import { useAdminMode } from "./AdminModeProvider";

const Toggle = styled.button<{ $on: boolean }>`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 10px 3px 6px;
  background: ${({ $on }) =>
    $on ? "var(--oxblood)" : "transparent"};
  border: 1px solid ${({ $on }) =>
    $on ? "var(--oxblood)" : "var(--rule-mid)"};
  border-radius: 3px;
  color: ${({ $on }) => ($on ? "#f1e8d2" : "var(--ink-tertiary)")};
  font-family: var(--font-labels), "IM Fell English", serif;
  font-size: 11px;
  font-style: italic;
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;

  &:hover {
    border-color: var(--oxblood);
    color: ${({ $on }) => ($on ? "#f1e8d2" : "var(--oxblood)")};
  }

  &:focus-visible {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 2px;
  }
`;

const Pip = styled.span<{ $on: boolean }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $on }) => ($on ? "#f1e8d2" : "var(--rule-mid)")};
  flex-shrink: 0;
  transition: background 0.15s;
`;

export default function AdminModeToggle() {
  const { adminMode, setAdminMode } = useAdminMode();
  return (
    <Toggle
      $on={adminMode}
      onClick={() => setAdminMode(!adminMode)}
      aria-pressed={adminMode}
      title={adminMode ? "Exit admin mode" : "Enter admin mode"}
    >
      <Pip $on={adminMode} />
      {adminMode ? "Admin: on" : "Admin"}
    </Toggle>
  );
}
