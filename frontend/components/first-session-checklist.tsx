"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  FIRST_72H_BODY,
  FIRST_72H_STEPS,
  FIRST_72H_TITLE,
  FIRST_SESSION_DISMISS_KEY,
  first72hStepDone,
  shouldShowFirstSessionChecklist,
  type First72hProgress,
} from "@/lib/first-72h";

/**
 * Post-join First 72 hours checklist. Same program as /referrals —
 * shown on signed-in home (sticky, dismissible) and onboarding.
 */
export default function FirstSessionChecklist({
  progress,
  variant = "home",
}: {
  progress: First72hProgress;
  variant?: "home" | "onboarding";
}) {
  const [dismissed, setDismissed] = useState(false);
  const [ready, setReady] = useState(variant === "onboarding");

  useEffect(() => {
    if (variant === "onboarding") return;
    try {
      setDismissed(localStorage.getItem(FIRST_SESSION_DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
    setReady(true);
  }, [variant]);

  if (!ready) return null;
  if (
    !shouldShowFirstSessionChecklist(
      progress,
      variant === "home" && dismissed,
    )
  ) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(FIRST_SESSION_DISMISS_KEY, "1");
    } catch {
      // localStorage unavailable — banner just reappears next visit
    }
  };

  const doneCount = FIRST_72H_STEPS.filter((step) =>
    first72hStepDone(step.id, progress),
  ).length;

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-aurora/40 bg-gradient-to-br from-aurora/20 via-slate-900 to-ember/20 p-6 shadow-glass"
      aria-label={FIRST_72H_TITLE}
    >
      {variant === "home" && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss first 72 hours checklist"
          className="absolute right-4 top-4 rounded-full border border-white/20 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      )}

      <p className="text-xs uppercase tracking-[0.3em] text-white/70">
        {FIRST_72H_TITLE}
      </p>
      <h2
        className="mt-2 text-2xl font-semibold"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Your first session
      </h2>
      <p className="mt-2 max-w-xl text-sm text-white/75">{FIRST_72H_BODY}</p>
      <p className="mt-1 text-xs text-white/50">
        {doneCount} of {FIRST_72H_STEPS.length} done
      </p>

      <ol className="mt-5 space-y-3">
        {FIRST_72H_STEPS.map((step, index) => {
          const done = first72hStepDone(step.id, progress);
          return (
            <li
              key={step.id}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3 ${
                done
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-white/10 bg-black/30"
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done ? "bg-emerald-500 text-white" : "bg-white/10 text-white/70"
                }`}
              >
                {done ? "✓" : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{step.title}</p>
                <p className="mt-0.5 text-xs text-white/60">{step.description}</p>
                {!done && (
                  <Link
                    href={step.href}
                    className="mt-2 inline-flex rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-white/80 hover:bg-white/10"
                  >
                    {step.cta} →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
