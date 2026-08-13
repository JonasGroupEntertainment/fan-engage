"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  TURNSTILE_CHALLENGE_ID,
  type TurnstileLoadState,
} from "@/lib/turnstile-ux";

export type { TurnstileLoadState };

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
  size?: "normal" | "compact" | "flexible";
  appearance?: "always" | "execute" | "interaction-only";
  callback?: (token: string) => void;
  "error-callback"?: () => void;
  "expired-callback"?: () => void;
  "timeout-callback"?: () => void;
  "unsupported-callback"?: () => void;
  "before-interactive-callback"?: () => void;
}

interface Props {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  onLoadStateChange?: (state: TurnstileLoadState) => void;
  theme?: "light" | "dark" | "auto";
}

const SCRIPT_ID = "cf-turnstile-script";
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const MAX_SCRIPT_RETRIES = 3;
const LOAD_TIMEOUT_MS = 12_000;

let scriptRequested = false;
const loadListeners = new Set<() => void>();

function notifyTurnstileLoaded() {
  for (const listener of [...loadListeners]) {
    try {
      listener();
    } catch {
      /* ignore listener errors */
    }
  }
}

/** True when a Turnstile site key is configured (widget will render). */
export function isTurnstileConfigured(): boolean {
  return Boolean(SITE_KEY);
}

/** Reset module loader state so a Retry can re-inject the script. */
export function resetTurnstileScriptLoader() {
  scriptRequested = false;
  document.getElementById(SCRIPT_ID)?.remove();
}

/**
 * Warm the Cloudflare script so the widget isn't a blank box on first paint
 * when the user later opens the magic-link path.
 */
export function prefetchTurnstileScript() {
  if (!SITE_KEY || typeof window === "undefined") return;
  if (window.turnstile || scriptRequested) return;
  scriptRequested = true;
  injectTurnstileScript(0);
}

// Retries with a cache-busting param: during a Cloudflare outage the browser
// can cache the 503 for the script URL, which would otherwise block every
// login until a hard refresh.
function injectTurnstileScript(attempt = 0, onGiveUp?: () => void) {
  document.getElementById(SCRIPT_ID)?.remove();
  const script = document.createElement("script");
  script.id = SCRIPT_ID;
  const buster = attempt > 0 ? `&cb=${Date.now()}` : "";
  // Explicit render mode — we call turnstile.render ourselves.
  script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad${buster}`;
  script.async = true;
  script.defer = true;
  script.onerror = () => {
    if (attempt < MAX_SCRIPT_RETRIES) {
      setTimeout(() => injectTurnstileScript(attempt + 1, onGiveUp), 1000 * (attempt + 1));
    } else {
      onGiveUp?.();
    }
  };
  document.head.appendChild(script);
}

export function TurnstileWidget({
  onSuccess,
  onError,
  onExpire,
  onLoadStateChange,
  theme = "dark",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loadState, setLoadState] = useState<TurnstileLoadState>("loading");
  const [retryNonce, setRetryNonce] = useState(0);

  const setState = useCallback(
    (state: TurnstileLoadState) => {
      setLoadState(state);
      onLoadStateChange?.(state);
    },
    [onLoadStateChange],
  );

  const markReadyIfIframe = useCallback(() => {
    if (!containerRef.current?.querySelector("iframe")) return false;
    setState("ready");
    return true;
  }, [setState]);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !SITE_KEY) return false;
    if (widgetIdRef.current) return true;

    try {
      // Clear any leftover iframe markup from a prior failed attempt.
      containerRef.current.innerHTML = "";
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme,
        size: "normal",
        appearance: "always",
        callback: (token: string) => {
          setState("ready");
          onSuccess(token);
        },
        "before-interactive-callback": () => {
          setState("ready");
        },
        "error-callback": () => {
          setState("error");
          onError?.();
        },
        "expired-callback": () => {
          onExpire?.();
        },
        "timeout-callback": () => {
          setState("error");
          onError?.();
        },
        "unsupported-callback": () => {
          setState("error");
          onError?.();
        },
      });
      // Do NOT flip to "ready" here — render() returns before the iframe
      // paints, which is how #11 still left a blank white box.
      markReadyIfIframe();
      return true;
    } catch (err) {
      console.warn("[turnstile] render failed", err);
      setState("error");
      onError?.();
      return false;
    }
  }, [onSuccess, onError, onExpire, theme, setState, markReadyIfIframe]);

  useEffect(() => {
    if (!SITE_KEY) return;

    let cancelled = false;

    const tryRender = () => {
      if (cancelled) return;
      renderWidget();
    };

    loadListeners.add(tryRender);
    window.onTurnstileLoad = () => {
      notifyTurnstileLoaded();
    };

    const container = containerRef.current;
    const observer = new MutationObserver(() => {
      if (!cancelled) markReadyIfIframe();
    });
    if (container) {
      observer.observe(container, { childList: true, subtree: true });
    }

    if (window.turnstile) {
      tryRender();
    } else if (!scriptRequested) {
      scriptRequested = true;
      injectTurnstileScript(0, () => {
        if (!cancelled) {
          setState("error");
          onError?.();
        }
      });
    }

    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      if (!widgetIdRef.current || !containerRef.current?.querySelector("iframe")) {
        console.warn("[turnstile] load timed out — widget never rendered");
        setState("error");
        onError?.();
      }
    }, LOAD_TIMEOUT_MS);

    return () => {
      cancelled = true;
      observer.disconnect();
      loadListeners.delete(tryRender);
      window.clearTimeout(timeout);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget, setState, onError, retryNonce, markReadyIfIframe]);

  function handleRetry() {
    resetTurnstileScriptLoader();
    widgetIdRef.current = null;
    if (containerRef.current) containerRef.current.innerHTML = "";
    setState("loading");
    setRetryNonce((n) => n + 1);
  }

  // If no site key is configured (dev / unconfigured), render nothing
  if (!SITE_KEY) return null;

  return (
    <div
      id={TURNSTILE_CHALLENGE_ID}
      tabIndex={-1}
      className="space-y-2 outline-none"
    >
      {/*
        color-scheme: light is required: :root { color-scheme: dark } makes
        Cloudflare's iframe paint as an empty white rectangle. theme="dark"
        still styles the challenge itself.
      */}
      <div
        className="relative w-full max-w-[300px]"
        style={{ colorScheme: "light", minHeight: 65 }}
      >
        {loadState === "loading" && (
          <div
            className="absolute inset-0 z-10 flex flex-col justify-center gap-2 rounded-lg border border-white/15 bg-black/70 px-3 py-2"
            role="status"
            aria-live="polite"
          >
            <div className="h-3 w-2/3 animate-pulse rounded bg-white/20" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
            <p className="text-xs text-white/70">Security check loading…</p>
          </div>
        )}
        <div
          ref={containerRef}
          className={loadState === "error" ? "hidden" : "min-h-[65px] w-full"}
          style={{ colorScheme: "light" }}
        />
      </div>
      {loadState === "error" && (
        <div className="space-y-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2">
          <p className="text-xs text-rose-200">
            Security check couldn&apos;t load. Check your connection, then retry —
            or use password sign-in instead.
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
          >
            Retry security check
          </button>
        </div>
      )}
    </div>
  );
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
    // Honor server fail-closed: only treat upstream/network as success when
    // the API explicitly failed open (TURNSTILE_FAIL_OPEN enabled).
    if (
      data.failedOpen === true &&
      (data.error === "upstream_error" || data.error === "network_error")
    ) {
      console.warn(`[turnstile] ${data.error} from verify API — failing open`);
      return { success: true, failedOpen: true, error: data.error };
    }
    return { success: false, error: data.error ?? "challenge_failed" };
  } catch (err) {
    // Transport failure — cannot reach our verify API. Fail open so a brief
    // outage doesn't hard-block signup/magic-link.
    console.warn("[turnstile] network_error calling verify API — failing open", err);
    return { success: true, failedOpen: true, error: "network_error" };
  }
}

// User-facing message for a failed verification.
export function turnstileFailureMessage(error?: string): string {
  if (error === "rate_limited") {
    return "Too many attempts. Please wait about 15 minutes, then try again.";
  }
  if (error === "missing_token") {
    return "Complete the security check, then try again — or use password sign-in.";
  }
  return "Security check expired. Please complete the new check and try again.";
}
