"use client";

import Link from "next/link";
import { Suspense, useSyncExternalStore, useState } from "react";
import { usePathname } from "next/navigation";

export const COOKIE_CONSENT_STORAGE_KEY = "fanengage_cookie_consent";
export const COOKIE_CONSENT_EVENT = "fanengage-cookie-consent";

// Read-only external store: any tab can dismiss via the button below; we
// return the stored string (or null) and let the component decide what to
// show. A no-op subscribe suffices — this is a once-per-mount read.
function subscribe() {
  return () => {};
}
function getSnapshot(): string | null {
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
}
function getServerSnapshot(): string | null {
  return null;
}

export function hasAcceptedCookieConsent(): boolean {
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { choice?: string };
    return parsed.choice === "accept";
  } catch {
    return false;
  }
}

export default function CookieBanner() {
  return (
    <Suspense fallback={null}>
      <CookieBannerInner />
    </Suspense>
  );
}

function CookieBannerInner() {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const pathname = usePathname() ?? "";

  // Don't compete with primary CTAs on form-heavy routes. The banner is
  // anchored at the bottom of the viewport on mobile (full-width, ~140-180px
  // tall) and was covering Submit / Turnstile. Suppress on these routes
  // including /signup?invite= — attribution still writes after Accept on
  // /invite.
  const HIDE_ON = [
    "/for-artists/apply",
    "/signup",
    "/login",
    "/forgot-password",
    "/reset-password",
    "/onboarding",
  ];
  const hiddenForRoute = HIDE_ON.some((prefix) => pathname.startsWith(prefix));

  const shown = stored === null && !dismissed && !hiddenForRoute;

  function accept() {
    try {
      window.localStorage.setItem(
        COOKIE_CONSENT_STORAGE_KEY,
        JSON.stringify({ choice: "accept", at: new Date().toISOString() }),
      );
    } catch {
      /* ignore */
    }
    // Notify invite/ref helpers so fanengage_ref can be set after Accept.
    window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
    setDismissed(true);
  }

  if (!shown) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 rounded-2xl border border-white/15 bg-slate-950/95 p-4 shadow-xl backdrop-blur md:inset-x-auto md:right-4 md:max-w-sm">
      <p className="text-sm text-white/90">
        Fan Engage uses essential cookies for sign-in and basic platform features.
        If you arrive via an invite link, we also set a referral cookie after you
        accept so we can credit your inviter. See our{" "}
        <Link href="/cookie-policy" className="text-aurora underline">
          Cookie Policy
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-aurora underline">
          Privacy Policy
        </Link>
        .
      </p>
      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={accept}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-3 py-1 text-xs font-semibold text-white"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
