"use client";

import {
  FACEBOOK_WINDOW_FEATURES,
  facebookShareUrl,
} from "@/lib/facebook-share";
import { inviteShareUrl } from "@/lib/invite-share";
import { useInviteCode } from "@/components/use-invite-code";

/**
 * "Share on Facebook" button.
 *
 * Opens Facebook's own share window for the link. A signed-in fan sends
 * their invite link under the same rule as the Share button
 * (lib/invite-share.ts), so a friend who joins from the post is credited to
 * them. Facebook builds the post's picture and title from the page behind
 * the link. No Facebook script or pixel is loaded.
 */
export interface FacebookShareButtonProps {
  /** Absolute URL to share. */
  url: string;
  /** Text beside the icon. Leave out for a round icon-only button. */
  label?: string;
  /** Icon-only size: "md" beside a labelled Share pill, "lg" beside a round Share icon. */
  size?: "md" | "lg";
}

const ACCESSIBLE_NAME = "Share on Facebook";

export default function FacebookShareButton({
  url,
  label,
  size = "md",
}: FacebookShareButtonProps) {
  const inviteCode = useInviteCode();

  function handleClick() {
    // The fan's invite link when they have one; the page address if not.
    const link = inviteShareUrl({
      origin: window.location.origin,
      url,
      inviteCode,
    });
    const facebookUrl = facebookShareUrl(link);
    if (!facebookUrl) return;
    window.open(facebookUrl, "_blank", FACEBOOK_WINDOW_FEATURES);
  }

  const iconOnly = !label;
  const roundSize = size === "lg" ? "h-[46px] w-[46px]" : "h-10 w-10";
  const baseClass = iconOnly
    ? `inline-flex ${roundSize} shrink-0 items-center justify-center rounded-full text-sm font-medium transition`
    : "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition";
  const styleClass = "border border-white/25 text-white/85 hover:bg-white/10";

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`${baseClass} ${styleClass}`}
      aria-label={iconOnly ? ACCESSIBLE_NAME : undefined}
      title={iconOnly ? ACCESSIBLE_NAME : undefined}
    >
      <FacebookIcon />
      {!iconOnly && <span>{label}</span>}
    </button>
  );
}

function FacebookIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.7c0-.9.3-1.6 1.6-1.6h1.7V4.2c-.3 0-1.3-.2-2.5-.2-2.5 0-4.2 1.5-4.2 4.3v2.5H7.4V14h2.7v8h3.4z" />
    </svg>
  );
}
