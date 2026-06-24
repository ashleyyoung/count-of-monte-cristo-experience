"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import styled from "styled-components";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "magic" | "signup" | "forgot";

// ---------------------------------------------------------------------------
// Styled
// ---------------------------------------------------------------------------

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

const Notice = styled.div`
  font-family: var(--font-body-stack);
  font-size: 0.95rem;
  color: var(--ink-secondary);
  line-height: 1.5;

  p + p {
    margin-top: 0.75rem;
  }
`;

const Footer = styled.p`
  margin-top: 1.25rem;
  font-family: var(--font-supporting-stack);
  font-size: 0.85rem;
  color: var(--ink-muted);
  text-align: center;
  line-height: 1.5;
`;

const TextButton = styled.button`
  display: inline;
  padding: 0;
  font: inherit;
  color: var(--ink-secondary);
  background: none;
  border: none;
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    color: var(--oxblood);
  }
`;

const Divider = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0.5rem 0;
  color: var(--ink-muted);
  font-family: var(--font-labels-stack);
  font-size: 0.8rem;

  &::before,
  &::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--rule-light);
  }
`;

const GhostButton = styled.button`
  width: 100%;
  padding: 0.6rem 1rem;
  font-family: var(--font-labels-stack);
  font-size: 0.9rem;
  color: var(--ink-secondary);
  background: transparent;
  border: 1px solid var(--rule-mid);
  border-radius: 2px;
  transition: border-color 0.15s, color 0.15s;

  &:hover:not(:disabled) {
    border-color: var(--ink-secondary);
    color: var(--ink-primary);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function authErrorMessage(err: unknown): string {
  if (
    err &&
    typeof err === "object" &&
    "message" in err &&
    typeof err.message === "string"
  ) {
    return err.message;
  }
  return "Something went wrong.";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const authCode = searchParams.get("code");

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    urlError ? decodeURIComponent(urlError.replace(/\+/g, " ")) : null,
  );
  const [loading, setLoading] = useState(false);

  // Supabase may land on /login with a PKCE code if the callback URL was wrong.
  useEffect(() => {
    if (!authCode) return;
    const next = searchParams.get("next") ?? "/";
    const params = new URLSearchParams({ code: authCode });
    if (next.startsWith("/")) params.set("next", next);
    router.replace(`/auth/confirm?${params.toString()}`);
  }, [authCode, router, searchParams]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    const supabase = createClient();
    const redirectTo = `${window.location.origin}/auth/confirm?next=${encodeURIComponent(mode === "forgot" ? "/reset-password" : "/")}`;

    try {
      if (mode === "signin") {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) throw authError;
        router.push("/");
        router.refresh();
        return;
      }

      if (mode === "magic") {
        const { error: authError } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        });
        if (authError) throw authError;
        setNotice(
          `A sign-in link has been sent to ${email}. Check your inbox and click the link to continue.`,
        );
        return;
      }

      if (mode === "signup") {
        const { error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (authError) throw authError;
        setNotice(
          "Account created. Check your email to confirm your address, then sign in.",
        );
        setMode("signin");
        setPassword("");
        return;
      }

      const { error: authError } = await supabase.auth.resetPasswordForEmail(
        email,
        { redirectTo },
      );
      if (authError) throw authError;
      setNotice(
        `If an account exists for ${email}, a password reset link is on its way.`,
      );
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === "signin" || mode === "magic"
      ? "Le Comte de Monte-Cristo"
      : mode === "signup"
        ? "Create an account"
        : "Reset password";

  const subtitle =
    mode === "signin"
      ? "Sign in to save your reading progress and return to where you left off."
      : mode === "magic"
        ? "Enter your email and we will send a one-time sign-in link."
        : mode === "signup"
          ? "Choose an email and password to track your reading progress."
          : "Enter your email and we will send a link to choose a new password.";

  const submitLabel =
    mode === "signin"
      ? loading ? "Signing in…" : "Sign in"
      : mode === "magic"
        ? loading ? "Sending…" : "Send magic link"
        : mode === "signup"
          ? loading ? "Creating account…" : "Create account"
          : loading ? "Sending…" : "Send reset link";

  return (
    <Page>
      <Card>
        <Title>{title}</Title>
        <Subtitle>{subtitle}</Subtitle>

        {notice ? (
          <Notice>
            <p>{notice}</p>
          </Notice>
        ) : (
          <Form onSubmit={handleSubmit}>
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              disabled={loading}
            />

            {mode !== "forgot" && mode !== "magic" && (
              <>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  placeholder={mode === "signup" ? "At least 8 characters" : ""}
                  disabled={loading}
                />
              </>
            )}

            {error && <ErrorMessage>{error}</ErrorMessage>}
            <Button type="submit" disabled={loading}>
              {submitLabel}
            </Button>

            {mode === "signin" && (
              <>
                <Divider>or</Divider>
                <GhostButton
                  type="button"
                  disabled={loading}
                  onClick={() => switchMode("magic")}
                >
                  Send a magic link instead
                </GhostButton>
              </>
            )}

            {mode === "magic" && (
              <>
                <Divider>or</Divider>
                <GhostButton
                  type="button"
                  disabled={loading}
                  onClick={() => switchMode("signin")}
                >
                  Sign in with password instead
                </GhostButton>
              </>
            )}
          </Form>
        )}

        <Footer>
          {(mode === "signin" || mode === "magic") && (
            <>
              <TextButton type="button" onClick={() => switchMode("forgot")}>
                Forgot password?
              </TextButton>
              {" · "}
              <TextButton type="button" onClick={() => switchMode("signup")}>
                Create account
              </TextButton>
            </>
          )}
          {mode === "signup" && (
            <>
              Already have an account?{" "}
              <TextButton type="button" onClick={() => switchMode("signin")}>
                Sign in
              </TextButton>
            </>
          )}
          {mode === "forgot" && (
            <>
              <TextButton type="button" onClick={() => switchMode("signin")}>
                Back to sign in
              </TextButton>
            </>
          )}
        </Footer>
      </Card>
    </Page>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
