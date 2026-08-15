"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SimpleMarkdown } from "@/components/simple-markdown";
import { canAcceptConsent, isScrollAtBottom } from "@/lib/consent-accept";

export type ConsentDoc = {
  slug: string;
  title: string;
  content_md: string;
};

export const CONSENT_VERSION = "2026-08-01.v1";

/**
 * Full-text consent gate. Shown once, before account creation.
 * Accept unlocks when every doc is already at the bottom (including
 * no-overflow / fully visible), or via an explicit "I have read these
 * terms" checkbox so mobile / nested-overflow cannot trap the fan.
 * Stacks above the cookie banner (z-50) so the banner cannot eat
 * clicks or scroll on this overlay.
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
  const [acknowledged, setAcknowledged] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const markTabIfAtBottom = useCallback((tabIndex: number) => {
    const el = scrollRef.current;
    if (!el) return;
    if (isScrollAtBottom(el)) {
      setScrolledEnd((prev) => (prev[tabIndex] ? prev : { ...prev, [tabIndex]: true }));
    }
  }, []);

  const handleScroll = useCallback(() => {
    markTabIfAtBottom(activeTab);
  }, [activeTab, markTabIfAtBottom]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    markTabIfAtBottom(activeTab);
  }, [open, activeTab, docs, markTabIfAtBottom]);

  useEffect(() => {
    if (!open) return;

    let raf1 = 0;
    let raf2 = 0;
    const check = () => markTabIfAtBottom(activeTab);
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(check);
    });

    const content = contentRef.current;
    const ro =
      typeof ResizeObserver !== "undefined" && content
        ? new ResizeObserver(check)
        : null;
    if (content) ro?.observe(content);
    window.addEventListener("resize", check);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro?.disconnect();
      window.removeEventListener("resize", check);
    };
  }, [open, activeTab, docs, markTabIfAtBottom]);

  if (!open) return null;

  const canAccept = canAcceptConsent({
    docCount: docs.length,
    scrolledEnd,
    acknowledged,
  });

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="glass-card relative z-[70] flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden p-0">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Review before you join
          </h2>
          <p className="mt-1 text-xs text-white/60">
            Scroll each document to the end, or confirm below that you have read them.
          </p>
          {docs.length > 1 && (
            <div className="mt-3 flex gap-2">
              {docs.map((d, i) => (
                <button
                  key={d.slug}
                  type="button"
                  onClick={() => setActiveTab(i)}
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
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-5 touch-pan-y"
        >
          <div ref={contentRef}>
            <SimpleMarkdown source={docs[activeTab]?.content_md ?? ""} />
            {!rewardsPublished && (
              <p className="mt-6 border-t border-white/10 pt-4 text-xs text-white/50">
                The Rewards Program Terms &amp; Conditions are still being finalized. By
                joining, you agree they will apply to your points and rewards once
                published, in addition to the terms above.
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-white/10 px-6 py-4">
          <label className="mb-3 flex cursor-pointer items-start gap-2.5 text-sm text-white/80">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-aurora"
            />
            <span>I have read these terms</span>
          </label>
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
              disabled={!canAccept}
              onClick={() => onAccept(CONSENT_VERSION)}
              className="rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glass disabled:cursor-not-allowed disabled:opacity-40"
            >
              {canAccept ? "I agree — create my account" : "Agree to continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
