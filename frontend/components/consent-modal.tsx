"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { SimpleMarkdown } from "@/components/simple-markdown";
import {
  CONSENT_COPY,
  canAcceptConsent,
  consentAcceptLabel,
  consentProgressLabel,
  isScrollAtBottom,
  reviewedConsentCount,
  shouldShowKeepScrollingCue,
} from "@/lib/consent-accept";

export type ConsentDoc = {
  slug: string;
  title: string;
  content_md: string;
};

export const CONSENT_VERSION = "2026-08-01.v1";

/**
 * Full-text consent gate. Shown once, before account creation.
 * Accept unlocks when every doc is already at the bottom (including
 * no-overflow / fully visible), or via an explicit acknowledgment
 * checkbox so mobile / nested-overflow cannot trap the fan.
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
  const reviewedCount = reviewedConsentCount(docs.length, scrolledEnd);
  const progressPct =
    acknowledged || docs.length === 0
      ? 100
      : Math.round((reviewedCount / docs.length) * 100);
  const showKeepScrollingCue = shouldShowKeepScrollingCue({
    currentDocReviewed: !!scrolledEnd[activeTab],
    acknowledged,
  });
  const acceptLabel = consentAcceptLabel(canAccept);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-8">
      <div className="glass-card relative z-[70] flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden p-0">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Review before you join
          </h2>
          <p className="mt-1 text-sm text-white/80">
            Scroll each document to the end, or confirm below that you have read them.
          </p>
          {docs.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold text-white">
                {consentProgressLabel(reviewedCount, docs.length)}
              </p>
              <div
                className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={docs.length}
                aria-valuenow={acknowledged ? docs.length : reviewedCount}
                aria-label={consentProgressLabel(reviewedCount, docs.length)}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-aurora to-ember transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
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

        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className={
              "min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-6 py-5 touch-pan-y" +
              (showKeepScrollingCue ? " pb-14" : "")
            }
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
          {showKeepScrollingCue && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-amber-300/40 bg-amber-400/20 px-6 py-2.5 text-sm font-semibold text-amber-100">
              {CONSENT_COPY.keepScrollingCue}
            </div>
          )}
        </div>

        <div className="border-t border-white/10 px-6 py-4">
          <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/25 bg-white/10 px-3 py-3 text-base font-medium text-white">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-aurora"
            />
            <span>{CONSENT_COPY.checkboxLabel}</span>
          </label>
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full px-4 py-2 text-sm text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <div className="flex min-w-0 flex-1 flex-col items-end gap-1.5">
              <button
                type="button"
                disabled={!canAccept}
                onClick={() => onAccept(CONSENT_VERSION)}
                className={
                  canAccept
                    ? "rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glass"
                    : "rounded-full border border-white/35 bg-white/15 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed"
                }
              >
                {acceptLabel}
              </button>
              {!canAccept && (
                <p className="max-w-xs text-right text-sm font-semibold text-amber-200">
                  {CONSENT_COPY.keepScrollingCue}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
