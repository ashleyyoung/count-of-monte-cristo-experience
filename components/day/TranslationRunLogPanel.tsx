"use client";

import { useEffect, useRef, useState } from "react";
import styled from "styled-components";

const Panel = styled.div`
  padding: 0 36px 12px;
  background: rgba(201, 162, 75, 0.06);
  border-bottom: 1px dashed var(--gilt-warm);

  @media (max-width: 600px) {
    padding: 0 20px 12px;
  }
`;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0 6px;
`;

const Title = styled.span`
  font-family: var(--font-labels-stack);
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-muted);
`;

const Status = styled.span<{ $active: boolean }>`
  font-family: var(--font-mono-stack, ui-monospace, monospace);
  font-size: 10px;
  color: ${({ $active }) => ($active ? "var(--gilt-deep)" : "var(--ink-muted)")};
`;

const Log = styled.pre`
  margin: 0;
  padding: 10px 12px;
  max-height: 280px;
  overflow: auto;
  border: 1px solid rgba(201, 162, 75, 0.35);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.55);
  font-family: var(--font-mono-stack, ui-monospace, monospace);
  font-size: 11px;
  line-height: 1.45;
  color: var(--ink-strong);
  white-space: pre-wrap;
  word-break: break-word;
`;

const Empty = styled.div`
  font-family: var(--font-labels-stack);
  font-size: 10px;
  color: var(--ink-muted);
  font-style: italic;
  padding: 8px 0;
`;

interface Props {
  date: string;
  runId: string;
  /** When the run finishes, refresh SSR state (status line, content). */
  onFinished?: () => void;
}

export default function TranslationRunLogPanel({
  date,
  runId,
  onFinished,
}: Props) {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<string>("queued");
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    finishedRef.current = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const res = await fetch(
          `/api/translation-run-log?date=${encodeURIComponent(date)}&runId=${encodeURIComponent(runId)}`,
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!cancelled) {
            setError(body.error ?? `HTTP ${res.status}`);
          }
          return;
        }
        const data = (await res.json()) as {
          content: string;
          status: string;
        };
        if (cancelled) return;
        setError(null);
        setContent(data.content);
        setStatus(data.status);
        if (data.status === "done" || data.status === "failed") {
          if (!finishedRef.current) {
            finishedRef.current = true;
            onFinished?.();
          }
          return;
        }
        timer = setTimeout(poll, 2000);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load log");
        }
        timer = setTimeout(poll, 4000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [date, runId, onFinished]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [content]);

  const active = status === "queued" || status === "running";

  return (
    <Panel>
      <Header>
        <Title>Translation log</Title>
        <Status $active={active}>
          {active ? `${status}…` : status}
        </Status>
      </Header>
      {error ? (
        <Empty>{error}</Empty>
      ) : content ? (
        <Log ref={logRef}>{content}</Log>
      ) : (
        <Empty>Waiting for output from translate-day…</Empty>
      )}
    </Panel>
  );
}
