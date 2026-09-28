"use client";

import Link from "next/link";
import { Suspense, useSyncExternalStore, useState } from "react";
import { usePathname } from "next/navigation";

export const COOKIE_CONSENT_STORAGE_KEY = "fanengage_cookie_consent";
export const COOKIE_CONSENT_EVENT = "fanengage-cookie-consent";
/** The only non-essential cookie. Cleared when a fan declines. */
export const REFERRAL_COOKIE_NAME = "fanengage_ref";

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
    "/auth",
  ];
  const hiddenForRoute = HIDE_ON.some((prefix) => pathname.startsWith(prefix));

  const shown = stored === null && !dismissed && !hiddenForRoute;

  function record(choice: "accept" | "decline") {
    try {
      window.localStorage.setItem(
        COOKIE_CONSENT_STORAGE_KEY,
        JSON.stringify({ choice, at: new Date().toISOString() }),
      );
    } catch {
      /* ignore */
    }
    // Notify invite/ref helpers (fanengage_ref is only set after Accept) and
    // the other floating prompts, which wait for consent to be resolved.
    window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
    setDismissed(true);
  }

  function accept() {
    record("accept");
  }

  function decline() {
    // Essential cookies only: drop any referral cookie already on the device.
    document.cookie = `${REFERRAL_COOKIE_NAME}=; path=/; max-age=0`;
    record("decline");
  }

  if (!shown) return null;

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-white/15 bg-slate-950/95 p-3 shadow-xl backdrop-blur sm:inset-x-4 sm:bottom-4 sm:p-4 md:inset-x-auto md:right-4 md:max-w-sm"
    >
      <p className="text-xs text-white/90 sm:text-sm">
        <span className="sm:hidden">
          We use essential cookies. Accept to also allow a referral cookie
          that credits your inviter.{" "}
        </span>
        <span className="hidden sm:inline">
          Fan Engage uses essential cookies for sign-in and basic platform
          features. If you arrive via an invite link, we also set a referral
          cookie after you accept so we can credit your inviter. Decline keeps
          it to essential cookies only.{" "}
        </span>
        See our{" "}
        <Link href="/cookie-policy" className="text-aurora underline">
          Cookie Policy
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="text-aurora underline">
          Privacy Policy
        </Link>
        .
      </p>
      <div className="mt-2 flex items-center justify-end gap-2 sm:mt-3">
        <button
          type="button"
          onClick={decline}
          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={accept}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-3 py-1 text-xs font-semibold text-white"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
