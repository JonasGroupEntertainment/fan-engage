"use client";

/**
 * "✨ Suggest captions" — sister of <CommentDrafter /> from Phase 3,
 * but for image posts. Activates when an image_url is set.
 *
 * Flow:
 *   1. User uploads an image (handled by <ImageUploader />). The
 *      uploader writes the URL into a hidden input; we listen via the
 *      `imageUrl` prop the parent threads in.
 *   2. User clicks "✨ Suggest captions". We POST to /api/ai/caption-image
 *      with { imageUrl, partialBody, artistSlug }.
 *   3. We render 3 chip buttons. Click → onPick(caption) appends to
 *      the textarea via the parent's setter.
 *   4. The parent flips a hidden `caption_used=1` form field so
 *      createPostAction can write community_posts.caption_used=true.
 *
 * Failure modes (see /api/ai/caption-image):
 *   - 401 — not signed in (shouldn't happen here; composer is auth-gated)
 *   - 503 — API key missing or Anthropic down → "try again later"
 *   - 500 — generic → "try again"
 */

import { useState } from "react";

interface Props {
  imageUrl: string | null;
  partialBody: string;
  artistSlug: string;
  onPick: (caption: string) => void;
  /** Set to true when one of the chips is clicked. Parent uses this to
   *  flip the hidden caption_used input on the form. */
  onUsedChange?: (used: boolean) => void;
}

export default function CaptionSuggester({
  imageUrl,
  partialBody,
  artistSlug,
  onPick,
  onUsedChange,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<string[] | null>(null);

  if (!imageUrl) return null;

  async function handleSuggest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/caption-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl, partialBody, artistSlug }),
      });
      const json = (await res.json()) as
        | { captions: string[] }
        | { error: string };
      if (!res.ok || !("captions" in json)) {
        throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      }
      setCaptions(json.captions);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Caption suggester failed — please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handlePick(caption: string) {
    onPick(caption);
    onUsedChange?.(true);
  }

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3">
      {!captions && (
        <button
          type="button"
          onClick={handleSuggest}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Generating…" : "✨ Suggest captions"}
        </button>
      )}

      {error && (
        <p className="text-xs text-rose-300/80">{error}</p>
      )}

      {captions && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-white/50">
            Pick one (it&apos;ll fill in your post body):
          </p>
          <div className="flex flex-col gap-1.5">
            {captions.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handlePick(c)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-left text-xs text-white/90 transition hover:border-white/30 hover:bg-black/60"
              >
                {c}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={loading}
            className="text-xs text-white/50 hover:text-white"
          >
            {loading ? "Regenerating…" : "↻ Regenerate"}
          </button>
        </div>
      )}
    </div>
  );
}
