"use client";

/**
 * "Progress at action" toast — "+10 pts · 1,569 to Gold".
 *
 * Driven by a tiny module-level store (no context provider, no URL state):
 *   * `pushPointsToast(result)` — call with whatever a points-earning server
 *     action returned. Silent when nothing was earned (cap / dedupe / undo).
 *   * `withPointsToast(action)` — wraps a server action so it can be used
 *     directly as `<form action={…}>` and still feed the toast.
 *   * `<PointsToastHost />` — renders the toast; mount once per page.
 *
 * Multiple hosts are harmless but only the first mounted one renders, so a
 * component may mount its own host without stacking duplicates.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatPointsToast, type PointsProgress } from "@/lib/points/progress";

type ToastState = { id: number; text: string } | null;

let state: ToastState = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const AUTO_DISMISS_MS = 4000;

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ToastState {
  return state;
}

function getServerSnapshot(): ToastState {
  return null;
}

export function dismissPointsToast() {
  if (timer) clearTimeout(timer);
  timer = null;
  state = null;
  emit();
}

/** Show a toast for an action result. No-op when nothing was earned. */
export function pushPointsToast(
  result: Partial<PointsProgress> | null | undefined,
): void {
  if (!result || typeof result.pointsAwarded !== "number") return;
  const text = formatPointsToast({
    pointsAwarded: result.pointsAwarded,
    lifetimePoints: result.lifetimePoints ?? 0,
    nextTier: result.nextTier ?? null,
  });
  if (!text) return;
  if (timer) clearTimeout(timer);
  state = { id: nextId++, text };
  emit();
  timer = setTimeout(dismissPointsToast, AUTO_DISMISS_MS);
}

/**
 * Wrap a server action so it still works as a `<form action>` (which wants a
 * void-returning function) while feeding the toast from its return value.
 */
export function withPointsToast<A extends unknown[]>(
  action: (...args: A) => Promise<Partial<PointsProgress> | undefined | void>,
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    const result = await action(...args);
    pushPointsToast(result ?? undefined);
  };
}

// Only the first mounted host renders, so stray extra hosts never double up.
let activeHost: symbol | null = null;

export default function PointsToastHost() {
  const toast = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [self] = useState(() => Symbol("points-toast-host"));
  // Claim/release the "active host" slot through the same store so no
  // setState runs inside the effect; the boolean snapshot is stable.
  const isActive = useSyncExternalStore(
    subscribe,
    () => activeHost === self,
    () => false,
  );

  useEffect(() => {
    if (activeHost === null) {
      activeHost = self;
      emit();
    }
    return () => {
      if (activeHost === self) {
        activeHost = null;
        emit();
      }
    };
  }, [self]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 sm:bottom-6"
    >
      {isActive && toast && (
        <div
          key={toast.id}
          role="status"
          className="points-toast-enter pointer-events-auto flex items-center gap-2 rounded-full border border-white/15 bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-black/40 backdrop-blur"
        >
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full bg-gradient-to-r from-aurora to-ember"
          />
          <span className="bg-gradient-to-r from-aurora to-ember bg-clip-text text-transparent">
            {toast.text.split(" · ")[0]}
          </span>
          <span className="text-white/60">·</span>
          <span className="text-white/85">{toast.text.split(" · ").slice(1).join(" · ")}</span>
          <button
            type="button"
            onClick={dismissPointsToast}
            aria-label="Dismiss"
            className="ml-1 rounded-full px-1 text-white/50 hover:text-white"
          >
            ×
          </button>
        </div>
      )}
      <style>{`
        @keyframes points-toast-in {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .points-toast-enter { animation: points-toast-in 180ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .points-toast-enter { animation: none; }
        }
      `}</style>
    </div>
  );
}
