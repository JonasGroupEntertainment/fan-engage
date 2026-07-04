"use client";

import { useState } from "react";

export default function InlineShareButton({
  title,
  text,
  url,
  label = "Share ↗",
  className = "text-white/60 hover:text-white",
}: {
  title: string;
  text: string;
  url: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (navigator as any).share({ title, text, url });
        return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <button type="button" onClick={handleShare} className={className}>
      {copied ? "✓ Copied" : label}
    </button>
  );
}
