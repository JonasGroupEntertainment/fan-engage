"use client";

import { useEffect } from "react";
import {
  COOKIE_CONSENT_EVENT,
  hasAcceptedCookieConsent,
} from "@/components/cookie-banner";

/**
 * Writes the fanengage_ref cookie only after cookie consent is Accepted.
 * Has to be a client component because Next.js only permits cookie mutation
 * inside Server Actions and Route Handlers — not page components.
 *
 * Gating referral attribution on Accept avoids a cosmetic "Decline" that
 * still left a tracking cookie in place.
 */
export default function SetRefCookie({ code }: { code: string }) {
  useEffect(() => {
    function writeRefCookie() {
      if (!hasAcceptedCookieConsent()) return;
      const maxAge = 60 * 60 * 24 * 30; // 30 days
      document.cookie = `fanengage_ref=${encodeURIComponent(code)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }

    writeRefCookie();
    window.addEventListener(COOKIE_CONSENT_EVENT, writeRefCookie);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, writeRefCookie);
  }, [code]);
  return null;
}
