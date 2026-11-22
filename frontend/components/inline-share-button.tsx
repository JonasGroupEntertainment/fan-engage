"use client";

import { useState } from "react";
import { sharePayload } from "@/lib/share-payload";
import { inviteShareUrl, shareTextWithoutUrl } from "@/lib/invite-share";
import { useInviteCode } from "@/components/use-invite-code";

/**
 * A share link styled as plain text ("↗ Share drop", "Bring friends ↗").
 *
 * Like the main Share button (components/share-button.tsx), a signed-in
 * fan sends their own invite link when they share a share page or an
 * artist page, so a friend who joins from it is credited to them
 * (lib/invite-share.ts). A visitor, and any other address, shares the
 * address as it is. An address that is already an invite link is left
 * alone.
 */
export default function InlineShareButton({
  title,
  text,
  url,
  href,
  label = "Share ↗",
  className = "text-white/60 hover:text-white",
}: {
  title: string;
  text: string;
  url: string;
  /** Real destination when Web Share is unavailable (signup for guests). */
  href?: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const inviteCode = useInviteCode();
  const dest = href ?? url;

  async function handleShare(e: React.MouseEvent<HTMLAnchorElement>) {
    // The fan's invite link when they have one, the address if not. Worked
    // out with no waiting, so the tap still opens the share sheet.
    const link = inviteShareUrl({ origin: window.location.origin, url, inviteCode });
    const message = link === url ? text : shareTextWithoutUrl(text, url);

    if (typeof navigator !== "undefined" && "share" in navigator) {
      e.preventDefault();
      try {
        // Link inside the text: some apps drop a separate url field.
        await navigator.share(sharePayload({ title, text: message, url: link }));
        return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    if (href && href !== url) {
      // Guest join / signup CTA — follow the link.
      return;
    }
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <a href={dest} onClick={handleShare} className={className}>
      {copied ? "✓ Copied" : label}
    </a>
  );
}
