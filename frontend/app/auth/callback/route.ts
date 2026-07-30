import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/app-url";
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

  const clientIp = getClientIp(request.headers);
  const rateLimitResult = callbackRateLimiter.check(clientIp);

  if (!rateLimitResult.success) {
    // A raw 429 JSON body here strands the user on a blank error page mid
    // sign-in; send them back to /login with a readable message instead.
    return NextResponse.redirect(
      `${APP_URL}/login?error=${encodeURIComponent(
        "Too many sign-in attempts. Please wait a few minutes, then use a fresh link.",
      )}`,
    );
  }

  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/";
  // Only allow same-origin relative paths ("//host" is protocol-relative).
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        `${APP_URL}/login?error=${encodeURIComponent(error.message)}`,
      );
    }
  }

  return NextResponse.redirect(`${APP_URL}${next}`);
}
