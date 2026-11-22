"use client";

import { useState } from "react";
import { sharePayload } from "@/lib/share-payload";
import { inviteShareUrl, shareTextWithoutUrl } from "@/lib/invite-share";
import { useInviteCode } from "@/components/use-invite-code";

/**
 * Reusable share button.
 *
 * Tries the native Web Share API first (mobile + most modern desktop
 * browsers); falls back to copying the URL to clipboard with a brief
 * "Copied" confirmation. Designed to drop into any unlock moment —
 * artist hub pages, founder share pages, badge celebrations, drop wins.
 *
 * A signed-in fan shares their own invite link (lib/invite-share.ts), so a
 * friend who joins from it is credited to them. A visitor shares the page
 * address as before.
 *
 * weekly-recap-tile.tsx has its own inline share implementation from
 * Stickiness Phase 3 — leaving that one alone to avoid touching the
 * recap rendering path. Future cleanup could replace it with this
 * component for consistency.
 */
export interface ShareButtonProps {
  /** What appears in the share sheet's title (Web Share API). */
  title: string;
  /** Body text — what gets pasted/messaged with the URL. */
  text: string;
  /** Absolute URL to share. */
  url: string;
  /** Button label. Defaults to "Share". */
  label?: string;
  /** Visual style. "primary" = brand gradient pill, "ghost" = outline. */
  variant?: "primary" | "ghost";
  /** Optional analytics hook called when share is invoked. */
  onShare?: () => void;
}

export default function ShareButton({
  title,
  text,
  url,
  label = "Share",
  variant = "ghost",
  onShare,
}: ShareButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const inviteCode = useInviteCode();

  async function handleShare() {
    onShare?.();

    // The fan's invite link when they have one, the page address if not.
    // Worked out with no waiting, so the tap still opens the share sheet.
    const link = inviteShareUrl({ origin: window.location.origin, url, inviteCode });
    const message = link === url ? text : shareTextWithoutUrl(text, url);

    // Web Share API path — opens the native share sheet on iOS/Android
    // and recent macOS/Windows browsers. Throws AbortError if the user
    // dismisses, which we silently swallow.
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        // Link inside the text: some apps drop a separate url field (BEP #196).
        await navigator.share(sharePayload({ title, text: message, url: link }));
        return;
      } catch (err) {
        // User cancelled — don't fall through to clipboard. Detected
        // via name === "AbortError" on most browsers.
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    // Clipboard fallback — copy the share URL and show a brief "Copied"
    // confirmation so the user knows something happened.
    try {
      await navigator.clipboard.writeText(link);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  }

  const baseClass =
    "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition disabled:opacity-60";
  const styleClass =
    variant === "primary"
      ? "bg-gradient-to-r from-aurora to-ember text-white shadow-glass hover:brightness-110"
      : "border border-white/25 text-white/85 hover:bg-white/10";

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`${baseClass} ${styleClass}`}
      aria-label={label}
    >
      <ShareIcon />
      <span>
        {state === "copied"
          ? "Link copied"
          : state === "error"
            ? "Couldn't share"
            : label}
      </span>
    </button>
  );
}

function ShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
