"use client";

import { useState } from "react";
import { sharePayload } from "@/lib/share-payload";

interface Props {
  url: string;
  text?: string;
  title?: string;
}

type ShareData = { url: string; text: string; title: string };
type NavWithShare = Navigator & {
  share?: (data: ShareData) => Promise<void>;
};

export default function NativeShareButton({ url, text, title }: Props) {
  const [shared, setShared] = useState(false);

  async function handleShare() {
    if (typeof navigator === "undefined") return;
    const nav = navigator as NavWithShare;
    const shareText = text ?? "Join me — first dibs on drops, surprises, and points.";
    const shareTitle = title ?? "Come hang out";

    // Prefer the native share sheet on supported platforms (mobile, Safari).
    if (typeof nav.share === "function") {
      try {
        // Link inside the text: some apps drop a separate url field (BEP #196).
        await nav.share(sharePayload({ url, text: shareText, title: shareTitle }));
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        console.warn("Native share failed:", err);
        // fall through to clipboard
      }
    }

    // Fallback: copy to clipboard.
    try {
      await nav.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (err) {
      console.warn("Clipboard copy failed:", err);
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
    >
      {shared ? "Shared!" : "Share"}
    </button>
  );
}
