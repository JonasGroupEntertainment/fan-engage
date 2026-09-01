"use client";

import { useState } from "react";

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
  const dest = href ?? url;

  async function handleShare(e: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      e.preventDefault();
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (navigator as any).share({ title, text, url });
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
      await navigator.clipboard.writeText(url);
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
