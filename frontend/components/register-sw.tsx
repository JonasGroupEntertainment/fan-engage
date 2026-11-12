"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js once on mount so push notifications and the installed
 * app shell work for every visitor — not only those who follow an artist
 * and have seen the install banner (components/install-prompt.tsx) or the
 * push opt-in prompt. Production only: in dev a service worker just gets
 * in the way of HMR. `register()` is idempotent in the browser, so the
 * other two call sites stay harmless.
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }
  // Browsers only allow SWs on secure origins (localhost counts as secure).
  return navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .catch(() => null);
}

export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    void registerServiceWorker();
  }, []);
  return null;
}
