"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { usePathname } from "next/navigation";
import {
  COOKIE_CONSENT_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
} from "@/components/cookie-banner";
import PremiumCta from "@/components/premium-cta";
import {
  PREMIUM_UPGRADE_PROMPT_COPY,
  PREMIUM_UPGRADE_PROMPT_STORAGE_KEY,
  applyPremiumEntitlementToPromptState,
  dismissPremiumUpgradePrompt,
  isCookieBannerOpen,
  lockPremiumUpgradePrompt,
  parsePremiumUpgradePromptState,
  pickFirstShowDelayMs,
  recordPremiumUpgradeNavigation,
  savePremiumUpgradePromptState,
  shouldShowPremiumUpgradePrompt,
  type PremiumUpgradePromptState,
} from "@/lib/premium-upgrade-prompt";

function subscribe() {
  return () => {};
}

function getSnapshot(): string | null {
  try {
    return window.localStorage.getItem(PREMIUM_UPGRADE_PROMPT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

function subscribeCookieConsent(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener(COOKIE_CONSENT_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(COOKIE_CONSENT_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function getCookieConsentSnapshot(): string | null {
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persist(state: PremiumUpgradePromptState) {
  try {
    savePremiumUpgradePromptState(window.localStorage, state);
  } catch {
    /* private mode / quota — prompt may reappear next visit */
  }
}

export default function PremiumUpgradePrompt({
  isPremium = false,
  signedIn = false,
}: {
  isPremium?: boolean;
  signedIn?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <PremiumUpgradePromptInner isPremium={isPremium} signedIn={signedIn} />
    </Suspense>
  );
}

function PremiumUpgradePromptInner({
  isPremium,
  signedIn,
}: {
  isPremium: boolean;
  signedIn: boolean;
}) {
  const pathname = usePathname() ?? "";
  const titleId = useId();
  const bodyId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousPathRef = useRef<string | null>(null);

  const persistedRaw = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const consentRaw = useSyncExternalStore(
    subscribeCookieConsent,
    getCookieConsentSnapshot,
    getServerSnapshot,
  );
  const persisted = parsePremiumUpgradePromptState(persistedRaw);
  const [session, setSession] = useState<PremiumUpgradePromptState | null>(
    null,
  );
  const [delayElapsed, setDelayElapsed] = useState(false);

  const state = applyPremiumEntitlementToPromptState(
    session ?? persisted,
    isPremium,
  );

  const eligible = shouldShowPremiumUpgradePrompt({
    signedIn,
    isPremium,
    state,
    pathname,
    cookieBannerOpen: isCookieBannerOpen({ consentRaw, pathname }),
  });
  const open = eligible && delayElapsed;

  useEffect(() => {
    if (!session) return;
    persist(session);
  }, [session]);

  useEffect(() => {
    if (!isPremium) return;
    const id = window.setTimeout(() => {
      setSession(lockPremiumUpgradePrompt());
    }, 0);
    return () => window.clearTimeout(id);
  }, [isPremium]);

  useEffect(() => {
    const nextPath = pathname.trim() || "/";
    const previous = previousPathRef.current;
    if (previous === null) {
      previousPathRef.current = nextPath;
      return;
    }
    if (previous === nextPath) return;
    previousPathRef.current = nextPath;
    // Route changes are the page-view signal — keep this in lockstep with
    // usePathname, same pattern as mobile-nav closing on navigation.
    setSession((current) =>
      recordPremiumUpgradeNavigation(
        current ?? parsePremiumUpgradePromptState(persistedRaw),
        previous,
        nextPath,
      ),
    );
  }, [pathname, persistedRaw]);

  useEffect(() => {
    if (!eligible) {
      const id = window.setTimeout(() => setDelayElapsed(false), 0);
      return () => window.clearTimeout(id);
    }
    const delay = pickFirstShowDelayMs();
    const id = window.setTimeout(() => setDelayElapsed(true), delay);
    return () => window.clearTimeout(id);
  }, [eligible]);

  const dismiss = useCallback(() => {
    setSession((current) =>
      dismissPremiumUpgradePrompt(
        current ?? parsePremiumUpgradePromptState(getSnapshot()),
      ),
    );
  }, [setSession]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-pointer bg-black/55 backdrop-blur-[2px]"
        aria-label="Dismiss upgrade prompt"
        onClick={dismiss}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-slate-950/95 p-6 shadow-glass"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-br from-aurora/35 via-transparent to-ember/20"
        />
        <button
          ref={closeRef}
          type="button"
          onClick={dismiss}
          aria-label="Close upgrade prompt"
          className="absolute right-4 top-4 z-10 rounded-full border border-white/20 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>

        <p className="relative text-xs uppercase tracking-[0.3em] text-white/60">
          Fan Engage Premium
        </p>
        <h2
          id={titleId}
          className="relative mt-2 pr-10 text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {PREMIUM_UPGRADE_PROMPT_COPY.headline}
        </h2>
        <p id={bodyId} className="relative mt-2 text-sm text-white/75">
          {PREMIUM_UPGRADE_PROMPT_COPY.body}
        </p>

        <div className="relative mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
          >
            {PREMIUM_UPGRADE_PROMPT_COPY.dismiss}
          </button>
          <PremiumCta copy="upgrade" onClick={dismiss} />
        </div>
      </div>
    </div>
  );
}
