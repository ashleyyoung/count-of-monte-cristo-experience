"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styled from "styled-components";
import { createClient } from "@/lib/supabase/client";

const Page = styled.main`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.25rem;
`;

const Card = styled.div`
  width: 100%;
  max-width: 26rem;
  padding: 2rem 1.75rem;
  background: var(--paper-card);
  border: 1px solid var(--rule-light);
  box-shadow: 0 2px 12px rgba(29, 20, 10, 0.06);
`;

const Title = styled.h1`
  font-family: var(--font-masthead-stack);
  font-size: 1.75rem;
  font-weight: 400;
  text-align: center;
  margin-bottom: 0.5rem;
`;

const Subtitle = styled.p`
  font-family: var(--font-supporting-stack);
  font-size: 0.95rem;
  color: var(--ink-secondary);
  text-align: center;
  margin-bottom: 1.5rem;
  line-height: 1.5;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const Label = styled.label`
  font-family: var(--font-labels-stack);
  font-size: 0.85rem;
  color: var(--ink-tertiary);
`;

const Input = styled.input`
  width: 100%;
  padding: 0.6rem 0.75rem;
  font-family: var(--font-body-stack);
  font-size: 1rem;
  color: var(--ink-primary);
  background: var(--paper-base);
  border: 1px solid var(--rule-mid);
  border-radius: 2px;

  &:focus {
    outline: 2px solid var(--gilt-warm);
    outline-offset: 1px;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Button = styled.button`
  margin-top: 0.25rem;
  padding: 0.65rem 1rem;
  font-family: var(--font-labels-stack);
  font-size: 0.95rem;
  color: var(--paper-base);
  background: var(--ink-primary);
  border: none;
  border-radius: 2px;
  transition: background 0.15s;

  &:hover:not(:disabled) {
    background: var(--ink-secondary);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const ErrorMessage = styled.p`
  font-size: 0.9rem;
  color: var(--oxblood);
  margin: 0;
`;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <Page>
      <Card>
        <Title>Choose a new password</Title>
        <Subtitle>Enter and confirm your new password to finish resetting.</Subtitle>

        <Form onSubmit={handleSubmit}>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            disabled={loading}
          />

          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            disabled={loading}
          />

          {error && <ErrorMessage>{error}</ErrorMessage>}
          <Button type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save password"}
          </Button>
        </Form>
      </Card>
    </Page>
  );
}
