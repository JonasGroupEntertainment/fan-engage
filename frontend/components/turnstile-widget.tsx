"use client";

import { useEffect, useRef, useCallback } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileOptions) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

interface TurnstileOptions {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
}

interface Props {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: "light" | "dark" | "auto";
}

const SCRIPT_ID = "cf-turnstile-script";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const MAX_SCRIPT_RETRIES = 3;

let scriptRequested = false;

/** True when a Turnstile site key is configured (widget will render). */
export function isTurnstileConfigured(): boolean {
  return Boolean(SITE_KEY);
}

// Retries with a cache-busting param: during a Cloudflare outage the browser
// can cache the 503 for the script URL, which would otherwise block every
// login until a hard refresh.
function injectTurnstileScript(attempt = 0) {
  document.getElementById(SCRIPT_ID)?.remove();
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  const buster = attempt > 0 ? `&cb=${Date.now()}` : "";
  script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad${buster}`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    if (attempt < MAX_SCRIPT_RETRIES) {
      setTimeout(() => injectTurnstileScript(attempt + 1), 1000 * (attempt + 1));
    }
  };
  document.head.appendChild(script);
}

export function TurnstileWidget({ onSuccess, onError, onExpire, theme = "dark" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !SITE_KEY) return;
    if (widgetIdRef.current) return; // already rendered

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      theme,
      callback: onSuccess,
      "error-callback": onError,
      "expired-callback": onExpire,
    });
  }, [onSuccess, onError, onExpire, theme]);

  useEffect(() => {
    if (!SITE_KEY) return; // Turnstile not configured — skip silently

    if (window.turnstile) {
      renderWidget();
    } else {
      // Script not yet loaded — attach a loader callback and inject the script once
      window.onTurnstileLoad = renderWidget;

      if (!scriptRequested) {
        scriptRequested = true;
        injectTurnstileScript();
      }
    }

    // Always clean up: the auth forms remount this widget (key bump) after
    // every verify attempt, so stale instances must be removed each time.
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  // If no site key is configured (dev / unconfigured), render nothing
  if (!SITE_KEY) return null;

  return <div ref={containerRef} className="mt-2" />;
}

export interface TurnstileVerifyResult {
  success: boolean;
  error?: string;
  failedOpen?: boolean;
}

// Call this from a form submit handler to verify the token server-side.
// Succeeds if verified (or if Turnstile isn't configured).
//
// Tokens are SINGLE-USE and expire after ~5 minutes: after calling this —
// whether it succeeds or fails — the token is spent, and the caller must
// remount the TurnstileWidget (bump its `key`) to get a fresh one before
// the next attempt.
//
// Upstream/network failures fail-open (logged server-side) so a Cloudflare
// outage doesn't hard-block auth. Missing tokens and real challenge failures
// stay fail-closed when keys are configured.
export async function verifyTurnstileToken(token: string | null): Promise<TurnstileVerifyResult> {
  if (!SITE_KEY) return { success: true }; // not configured — allow through
  if (!token) return { success: false, error: "missing_token" };

  try {
    const res = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.status === 429) return { success: false, error: "rate_limited" };
    const data = (await res.json()) as {
      success: boolean;
      error?: string;
      failedOpen?: boolean;
    };
    if (data.success === true) {
      return { success: true, failedOpen: data.failedOpen };
    }
    // Server may still return upstream_error when TURNSTILE_FAIL_OPEN=false.
    // Client-side transport failures also fail-open below.
    if (data.error === "upstream_error" || data.error === "network_error") {
      console.warn(`[turnstile] ${data.error} from verify API — failing open`);
      return { success: true, failedOpen: true, error: data.error };
    }
    return { success: false, error: data.error ?? "challenge_failed" };
  } catch (err) {
    console.warn("[turnstile] network_error calling verify API — failing open", err);
    return { success: true, failedOpen: true, error: "network_error" };
  }
}

// User-facing message for a failed verification.
export function turnstileFailureMessage(error?: string): string {
  if (error === "rate_limited") {
    return "Too many attempts. Please wait about 15 minutes, then try again.";
  }
  return "Security check expired. Please complete the new check and try again.";
}
