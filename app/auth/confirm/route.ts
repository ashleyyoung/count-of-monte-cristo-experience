import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles Supabase email auth callbacks (signup confirmation, password recovery).
 *
 * PKCE (current default):
 *   /auth/confirm?code=<code>&next=/
 *
 * Legacy email OTP:
 *   /auth/confirm?token_hash=<hash>&type=recovery|signup&next=/
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.clone();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as
    | "magiclink"
    | "recovery"
    | "signup"
    | "email"
    | null;
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return redirectToLogin(request, error.message);
    }

    url.pathname = safeNext;
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (error) {
      return redirectToLogin(request, error.message);
    }

    if (type === "recovery") {
      url.pathname = "/reset-password";
      url.search = "";
      return NextResponse.redirect(url);
    }

    url.pathname = safeNext;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return redirectToLogin(request, "Missing auth callback parameters.");
}

function redirectToLogin(request: NextRequest, message: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", message);
  return NextResponse.redirect(loginUrl);
}
