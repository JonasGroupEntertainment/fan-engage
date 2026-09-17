"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import PremiumCta from "@/components/premium-cta";
import {
  PREMIUM_UPGRADE_PROMPT_COPY,
  applyPremiumEntitlementToPromptState,
  dismissPremiumUpgradePrompt,
  loadPremiumUpgradePromptState,
  pickFirstShowDelayMs,
  recordPremiumUpgradeNavigation,
  savePremiumUpgradePromptState,
  shouldShowPremiumUpgradePrompt,
  type PremiumUpgradePromptState,
  EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
} from "@/lib/premium-upgrade-prompt";

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function persist(state: PremiumUpgradePromptState) {
  const storage = browserStorage();
  if (storage) savePremiumUpgradePromptState(storage, state);
}

export default function PremiumUpgradePrompt({
  isPremium = false,
}: {
  isPremium?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <PremiumUpgradePromptInner isPremium={isPremium} />
    </Suspense>
  );
}

function PremiumUpgradePromptInner({ isPremium }: { isPremium: boolean }) {
  const pathname = usePathname() ?? "";
  const titleId = useId();
  const bodyId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousPathRef = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PremiumUpgradePromptState>(
    EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
  );

  useEffect(() => {
    const storage = browserStorage();
    const loaded = storage
      ? loadPremiumUpgradePromptState(storage)
      : { ...EMPTY_PREMIUM_UPGRADE_PROMPT_STATE };
    const next = applyPremiumEntitlementToPromptState(loaded, isPremium);
    setState(next);
    if (next !== loaded) persist(next);
    setReady(true);
    if (isPremium) setOpen(false);
  }, [isPremium]);

  useEffect(() => {
    if (!ready) return;
    if (previousPathRef.current === null) {
      previousPathRef.current = pathname;
      return;
    }
    const previous = previousPathRef.current;
    previousPathRef.current = pathname;
    setState((current) => {
      const next = recordPremiumUpgradeNavigation(current, previous, pathname);
      if (next !== current) persist(next);
      return next;
    });
  }, [pathname, ready]);

  const eligible =
    ready &&
    shouldShowPremiumUpgradePrompt({
      isPremium,
      state,
      pathname,
    });

  useEffect(() => {
    if (!eligible) {
      setOpen(false);
      return;
    }
    const delay = pickFirstShowDelayMs();
    const id = window.setTimeout(() => setOpen(true), delay);
    return () => window.clearTimeout(id);
  }, [eligible]);

  const dismiss = useCallback(() => {
    setState((current) => {
      const next = dismissPremiumUpgradePrompt(current);
      persist(next);
      return next;
    });
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismiss]);

  if (!open || !eligible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 cursor-pointer bg-black/55 backdrop-blur-[2px]"
        onClick={dismiss}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-slate-950/95 p-6 shadow-glass"
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
          <span onClickCapture={dismiss}>
            <PremiumCta copy="upgrade" />
          </span>
        </div>
      </div>
    </div>
  );
}
