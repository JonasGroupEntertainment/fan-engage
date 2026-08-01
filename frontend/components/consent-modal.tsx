"use client";

import { useCallback, useRef, useState } from "react";
import { SimpleMarkdown } from "@/components/simple-markdown";

export type ConsentDoc = {
  slug: string;
  title: string;
  content_md: string;
};

export const CONSENT_VERSION = "2026-08-01.v1";

/**
 * Full-text, scroll-to-accept consent gate. Shown once, before account
 * creation, so consent is captured at signup instead of a later screen.
 * Rewards Program terms are referenced but not embedded here while that
 * policy is still a draft (see rewards_terms in policy_pages) — the note
 * at the bottom makes clear it will apply once published.
 */
export function ConsentModal({
  open,
  docs,
  rewardsPublished,
  onAccept,
  onCancel,
}: {
  open: boolean;
  docs: ConsentDoc[];
  rewardsPublished: boolean;
  onAccept: (version: string) => void;
  onCancel: () => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [scrolledEnd, setScrolledEnd] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom) {
      setScrolledEnd((prev) => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }));
    }
  }, [activeTab]);

  if (!open) return null;

  const allRead = docs.every((_, i) => scrolledEnd[i]);

  function switchTab(i: number) {
    setActiveTab(i);
    // Re-check on tab switch in case the doc is short enough to already be at the bottom.
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      if (atBottom) setScrolledEnd((prev) => ({ ...prev, [i]: true }));
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="glass-card flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden p-0">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Review before you join
          </h2>
          <p className="mt-1 text-xs text-white/60">
            Scroll to the bottom of each document to unlock acceptance.
          </p>
          {docs.length > 1 && (
            <div className="mt-3 flex gap-2">
              {docs.map((d, i) => (
                <button
                  key={d.slug}
                  type="button"
                  onClick={() => switchTab(i)}
                  className={
                    "rounded-full px-3 py-1 text-xs font-medium transition " +
                    (activeTab === i
                      ? "bg-aurora/20 text-aurora"
                      : "text-white/50 hover:text-white/80")
                  }
                >
                  {d.title}
                  {scrolledEnd[i] ? " ✓" : ""}
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-5"
        >
          <SimpleMarkdown source={docs[activeTab]?.content_md ?? ""} />
          {!rewardsPublished && (
            <p className="mt-6 border-t border-white/10 pt-4 text-xs text-white/50">
              The Rewards Program Terms &amp; Conditions are still being finalized. By
              joining, you agree they will apply to your points and rewards once
              published, in addition to the terms above.
            </p>
          )}
        </div>

        <div className="border-t border-white/10 px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-2 text-sm text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!allRead}
              onClick={() => onAccept(CONSENT_VERSION)}
              className="rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glass disabled:cursor-not-allowed disabled:opacity-40"
            >
              {allRead ? "I agree — create my account" : "Scroll to continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
