"use client";

/**
 * TagSuggester — sister of CaptionSuggester (FE Phase 12).
 *
 * Self-contained: owns its own state, renders a hidden input named
 * `ai_suggested_tags` containing comma-separated selected tags. The
 * parent composer just renders <TagSuggester partialBody={body} … />.
 *
 * Hides itself when partialBody is < 12 chars.
 *
 * Failure modes:
 *   - 401 — not signed in (composer is auth-gated; shouldn't happen)
 *   - 500 / network — we just show "try again" and let the user move on
 */

import { useMemo, useState } from "react";

interface Props {
  partialBody: string;
  artistSlug: string;
  /** Hidden input field name. Defaults to "ai_suggested_tags". */
  name?: string;
}

export default function TagSuggester({
  partialBody,
  artistSlug,
  name = "ai_suggested_tags",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const ready = partialBody.trim().length >= 12;
  const hiddenValue = useMemo(() => Array.from(selected).join(","), [selected]);

  async function handleSuggest() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partialBody, artistSlug }),
      });
      const json = (await res.json()) as
        | { tags: string[] }
        | { error: string };
      if (!res.ok || !("tags" in json)) {
        throw new Error("error" in json ? json.error : `HTTP ${res.status}`);
      }
      setSuggestions(json.tags);
      // Auto-select all returned tags by default — fans can deselect
      setSelected(new Set(json.tags));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Tag suggester failed — please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggle(tag: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3">
      <input type="hidden" name={name} value={hiddenValue} />

      {!suggestions && (
        <button
          type="button"
          onClick={handleSuggest}
          disabled={!ready || loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          title={!ready ? "Type at least 12 characters first" : undefined}
        >
          {loading ? "Thinking…" : "✨ Suggest tags"}
        </button>
      )}

      {error && <p className="text-xs text-rose-300/80">{error}</p>}

      {suggestions && suggestions.length === 0 && (
        <p className="text-xs text-white/60">
          No tag ideas — your post might be a bit short or off-topic for the
          existing taxonomy. You can submit without tags; they&apos;ll be added
          automatically later.
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-white/50">
            Tap to toggle:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((tag) => {
              const on = selected.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(tag)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    on
                      ? "border-aurora/40 bg-aurora/15 text-aurora"
                      : "border-white/15 bg-white/5 text-white/60 hover:bg-white/10"
                  }`}
                >
                  {on ? "✓ " : "+ "}
                  {tag}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={handleSuggest}
            disabled={loading}
            className="text-[10px] text-white/50 hover:text-white"
          >
            {loading ? "Refreshing…" : "↻ Refresh suggestions"}
          </button>
        </div>
      )}
    </div>
  );
}
