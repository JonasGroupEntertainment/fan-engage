import { NextResponse, type NextRequest } from "next/server";
import { APP_URL } from "@/lib/app-url";
import {
  authCallbackCompletePath,
  authCallbackErrorPath,
  authCallbackIncompleteMessage,
  authCallbackUserMessage,
  isPkceVerifierMissingError,
  parseAuthCallbackSearch,
} from "@/lib/auth-callback";
import { isForgotPasswordEnabled } from "@/lib/auth-doors";
import { callbackRateLimiter, getClientIp } from "@/lib/rate-limit";
import { createCallbackSupabase } from "@/lib/supabase/callback-server";

/**
 * Handles:
 *   - PKCE email links (`?code=`) from magic-link, signup confirm, recovery
 *   - token_hash email links (`?token_hash=&type=`) which do not need PKCE
 *   - email confirmation redirects from supabase.auth.signUp
 *
 * PKCE verifiers live in a first-party browser cookie. A cross-site 302 from
 * *.supabase.co often omits that SameSite=Lax cookie on the first server
 * request (2026-08-26: "PKCE code verifier not found in storage"). When that
 * happens, send the user to `/auth/complete` so the browser can exchange.
 */
export async function GET(request: NextRequest) {
  const parsed = parseAuthCallbackSearch(new URL(request.url).searchParams);
  const forgotPasswordEnabled = isForgotPasswordEnabled();
  const redirectTo = (path: string) =>
    NextResponse.redirect(new URL(path, `${APP_URL}/`));
  const fail = (message: string) =>
    redirectTo(
      authCallbackErrorPath({
        next: parsed.next,
        message,
        forgotPasswordEnabled,
      }),
    );

  const clientIp = getClientIp(request.headers);
  const rateLimitResult = callbackRateLimiter.check(clientIp);
  if (!rateLimitResult.success) {
    return fail(
      "Too many sign-in attempts. Please wait a few minutes, then use a fresh link.",
    );
  }

  if (parsed.providerError) {
    return fail(authCallbackUserMessage(parsed.next));
  }

  if (!parsed.code && !parsed.tokenHash) {
    // Hash fragments (implicit recovery) never reach this server route.
    // Hand off to the browser page, which can read them.
    return redirectTo(authCallbackCompletePath({ next: parsed.next }));
  }

  try {
    const { supabase, applyCookies } = createCallbackSupabase(request);

    if (parsed.tokenHash && parsed.type) {
      const { error } = await supabase.auth.verifyOtp({
        type: parsed.type,
        token_hash: parsed.tokenHash,
      });
      if (error) return fail(authCallbackUserMessage(parsed.next));
      return applyCookies(redirectTo(parsed.next));
    }

    if (parsed.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
      if (error) {
        if (isPkceVerifierMissingError(error.message)) {
          return redirectTo(
            authCallbackCompletePath({
              code: parsed.code,
              next: parsed.next,
            }),
          );
        }
        return fail(authCallbackUserMessage(parsed.next));
      }
      return applyCookies(redirectTo(parsed.next));
    }

    return fail(authCallbackIncompleteMessage(parsed.next));
  } catch {
    if (parsed.code || parsed.tokenHash) {
      return redirectTo(
        authCallbackCompletePath({
          code: parsed.code,
          tokenHash: parsed.tokenHash,
          type: parsed.type,
          next: parsed.next,
        }),
      );
    }
    return fail(authCallbackUserMessage(parsed.next));
  }
}
