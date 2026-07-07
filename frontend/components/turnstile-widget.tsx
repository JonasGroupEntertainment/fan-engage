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
      return;
    }

    // Script not yet loaded — attach a loader callback and inject the script once
    window.onTurnstileLoad = renderWidget;

    if (!scriptRequested) {
      scriptRequested = true;
      injectTurnstileScript();
    }

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

// Call this from a form submit handler to verify the token server-side.
// Returns true if verified (or if Turnstile isn't configured).
export async function verifyTurnstileToken(token: string | null): Promise<boolean> {
  if (!SITE_KEY) return true; // not configured — allow through
  if (!token) return false;

  try {
    const res = await fetch("/api/turnstile/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
