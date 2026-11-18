"use client";

import { useState } from "react";
import { sharePayload } from "@/lib/share-payload";
import type { WeeklyRecap } from "@/lib/personal-recap/types";
import { dateRange } from "@/lib/format/relative-time";

/**
 * "Your week" tile on Fan Home.
 *
 * Spotify-Wrapped-style stat card: 4 numeric tiles + a top-artist line +
 * a share button. Renders only when WeeklyRecap.hasActivity is true —
 * empty-state weekly recaps feel discouraging, so we just hide.
 *
 * Share button uses the native Web Share API where available
 * (mobile + most modern desktops); falls back to copy-to-clipboard.
 */

interface WeeklyRecapTileProps {
  recap: WeeklyRecap;
  /** Display name to lead with — usually the fan's first name. */
  firstName?: string | null;
}

export default function WeeklyRecapTile({
  recap,
  firstName,
}: WeeklyRecapTileProps) {
  const [shareState, setShareState] = useState<
    "idle" | "copied" | "error"
  >("idle");

  if (!recap.hasActivity) return null;

  const totalEngagement =
    recap.reactionsGiven + recap.commentsAdded + recap.rsvpsAdded;

  const stats: Array<{ value: number; label: string; suffix?: string }> = [
    { value: recap.reactionsGiven, label: "reactions" },
    { value: recap.commentsAdded, label: "comments" },
    { value: recap.rsvpsAdded, label: "RSVPs added" },
    { value: recap.pointsEarned, label: "points earned" },
  ];

  function buildShareText(): string {
    const lines: string[] = [];
    if (firstName) {
      lines.push(`${firstName}'s week on Fan Engage`);
    } else {
      lines.push(`My week on Fan Engage`);
    }
    if (totalEngagement > 0) {
      const bits: string[] = [];
      if (recap.reactionsGiven > 0)
        bits.push(`${recap.reactionsGiven} reactions`);
      if (recap.commentsAdded > 0) bits.push(`${recap.commentsAdded} comments`);
      if (recap.rsvpsAdded > 0) bits.push(`${recap.rsvpsAdded} RSVPs`);
      lines.push(bits.join(" · "));
    }
    if (recap.pointsEarned > 0) {
      lines.push(`+${recap.pointsEarned.toLocaleString()} pts earned`);
    }
    if (recap.currentStreakDays > 0) {
      lines.push(
        `🔥 ${recap.currentStreakDays}-day streak${
          recap.topArtistName ? ` · top artist: ${recap.topArtistName}` : ""
        }`,
      );
    }
    return lines.join("\n");
  }

  async function onShare() {
    const text = buildShareText();
    const shareUrl =
      typeof window !== "undefined" ? window.location.origin : "";
    try {
      const nav = navigator as Navigator & {
        share?: (data: ShareData) => Promise<void>;
      };
      if (nav.share) {
        await nav.share(
          sharePayload({ title: "My week on Fan Engage", text, url: shareUrl }),
        );
        setShareState("idle");
      } else {
        await navigator.clipboard.writeText(`${text}\n${shareUrl}`);
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 2000);
      }
    } catch {
      setShareState("error");
      setTimeout(() => setShareState("idle"), 2000);
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-rose-500/10 p-5 shadow-lg shadow-fuchsia-500/5">
      {/* Subtle decorative glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-8 -left-8 h-40 w-40 rounded-full opacity-30 blur-3xl"
        style={{
          background:
            "radial-gradient(circle at center, rgba(217, 70, 239, 0.6), transparent 70%)",
        }}
      />

      <header className="relative flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/55">
            Your week
          </p>
          <p className="mt-1 text-base font-semibold text-white">
            {dateRange(recap.windowStart, recap.windowEnd) || "This week"}
          </p>
        </div>
        <button
          type="button"
          onClick={onShare}
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white/85 transition hover:border-white/30 hover:text-white"
        >
          {shareState === "copied"
            ? "Copied!"
            : shareState === "error"
              ? "Try again"
              : "Share"}
        </button>
      </header>

      <div className="relative mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-center"
          >
            <p className="text-2xl font-semibold leading-none text-white">
              {s.value > 0 && s.label === "points earned"
                ? `+${s.value.toLocaleString()}`
                : s.value.toLocaleString()}
            </p>
            <p className="mt-1 text-xs uppercase tracking-wide text-white/55">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {(recap.topArtistName || recap.currentStreakDays > 0) && (
        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs text-white/70">
          {recap.topArtistName ? (
            <span>
              Most active in{" "}
              <span className="font-semibold text-white">
                {recap.topArtistName}
              </span>
            </span>
          ) : (
            <span />
          )}
          {recap.currentStreakDays > 0 && (
            <span className="text-white/55">
              🔥 {recap.currentStreakDays}-day streak
            </span>
          )}
        </div>
      )}
    </div>
  );
}
