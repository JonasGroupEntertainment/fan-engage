"use client";

/**
 * AltTextSuggester — auto-generates accessibility alt text the moment
 * an image is uploaded. Sister of CaptionSuggester (Phase 12), but
 * with different UX: alt text is mandatory for every image so we don't
 * make the fan click a button — the suggestion appears automatically
 * and they can edit it before submit.
 *
 * Failure modes:
 *   - 401 — composer is auth-gated; shouldn't happen
 *   - 500 / vision API down — silently fall back to empty string
 *     (fan can type their own alt text)
 *   - Image fetch fails server-side — same fallback
 *
 * The component renders a hidden input named `image_alt` so the
 * server action picks up the (possibly fan-edited) value.
 */

import { useEffect, useState } from "react";

interface Props {
  imageUrl: string | null;
  artistSlug: string;
  /** Optional: post body the fan is typing — passed to the model
   *  to disambiguate what's important about the image. */
  partialBody?: string;
  /** Hidden input field name. Defaults to "image_alt". */
  name?: string;
}

export default function AltTextSuggester({
  imageUrl,
  artistSlug,
  partialBody = "",
  name = "image_alt",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altText, setAltText] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);

  useEffect(() => {
    if (!imageUrl) {
      // Image was removed — clear state
      setAltText("");
      setError(null);
      setAiGenerated(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/ai/alt-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl, artistSlug, partialBody }),
    })
      .then(async (res) => {
        const json = (await res.json()) as
          | { altText: string }
          | { error: string };
        if (cancelled) return;
        if (!res.ok || !("altText" in json)) {
          throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
        }
        if (json.altText) {
          setAltText(json.altText);
          setAiGenerated(true);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "Couldn't generate alt text — please type your own.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // partialBody intentionally omitted from deps — we generate once on
    // image upload, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, artistSlug]);

  if (!imageUrl) return null;

  return (
    <div className="space-y-1.5 rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] uppercase tracking-wide text-white/50">
          Alt text {aiGenerated && <span className="text-aurora">· AI-suggested, edit if you&apos;d like</span>}
        </label>
        {loading && (
          <span className="text-[10px] text-white/50">Thinking…</span>
        )}
      </div>
      <input
        type="text"
        name={name}
        value={altText}
        onChange={(e) => {
          setAltText(e.target.value);
          // Once fan edits, mark as no-longer AI-original
          if (aiGenerated) setAiGenerated(false);
        }}
        maxLength={200}
        placeholder={
          loading
            ? "Generating alt text…"
            : "Describe the image for screen readers"
        }
        className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
      />
      {error && (
        <p className="text-[10px] text-rose-300/70">
          {error} You can type your own description above.
        </p>
      )}
    </div>
  );
}
