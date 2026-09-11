import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { APP_URL, sanitizeNextPath } from "@/lib/app-url";
import { callbackRateLimiter, getClientIp } from "@/lib/rate-limit";

/**
 * Handles:
 *   - magic-link confirmations (?code=...)
 *   - email confirmation redirects from supabase.auth.signUp
 *
 * Exchanges the `code` for a session and redirects to `next` (defaults to /).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const next = sanitizeNextPath(searchParams.get("next"));
  const loginError = (message: string) => NextResponse.redirect(
    `${APP_URL}/login?${new URLSearchParams({ next, error: message })}`,
  );

  const clientIp = getClientIp(request.headers);
  const rateLimitResult = callbackRateLimiter.check(clientIp);

  if (!rateLimitResult.success) {
    // A raw 429 JSON body here strands the user on a blank error page mid
    // sign-in; send them back to /login with a readable message instead.
    return loginError("Too many sign-in attempts. Please wait a few minutes, then use a fresh link.");
  }

  const code = searchParams.get("code");
  if (!code) return loginError("This sign-in link is incomplete. Please sign in again.");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return loginError("This sign-in link has expired or could not be verified. Please sign in again.");
    }
  }

  return NextResponse.redirect(`${APP_URL}${next}`);
}
