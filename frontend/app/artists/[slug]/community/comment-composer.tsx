"use client";

/**
 * Comment composer with the AI-drafter "✨ Draft a reply" button.
 *
 * Drop-in replacement for the inline <form action={addCommentAction}>
 * that used to live in post-card.tsx. Wraps the same server action +
 * fields, plus state for the drafter UX.
 *
 * Behavior:
 *   * Idle: shows the textarea + Post button. ✨ button on the left.
 *   * Click ✨ → POST /api/ai/draft-comment → 3 chip buttons appear
 *     above the textarea.
 *   * Click a chip → fills the textarea (still editable).
 *   * If the user posts a comment that started life as a draft, the
 *     hidden draft_used input is true so the server action can record
 *     the A/B signal on the row.
 *   * Click ✨ again to regenerate (each click hits the API freshly —
 *     drafts are never cached).
 *
 * Tracks `draft_used` purely on the user's actual selection — if they
 * click a chip and then completely retype the comment, draft_used is
 * still true. That's the right signal for measuring whether the
 * drafter caused the comment to exist at all.
 */

import { useState, useRef, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { addCommentAction } from "./actions";

interface Props {
  postId: string;
  artistSlug: string;
}

export default function CommentComposer({ postId, artistSlug }: Props) {
  const [body, setBody] = useState("");
  const [drafts, setDrafts] = useState<string[] | null>(null);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  // True if the current body originated from a draft chip (and the
  // user may have edited it after).
  const [draftUsed, setDraftUsed] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  async function handleDraftClick() {
    setLoadingDrafts(true);
    setDraftError(null);
    setDrafts(null);
    try {
      const res = await fetch("/api/ai/draft-comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const json = (await res.json()) as { drafts?: string[]; error?: string };
      if (!res.ok || !json.drafts) {
        setDraftError(json.error ?? `Drafter unavailable (${res.status}).`);
        return;
      }
      setDrafts(json.drafts);
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : "Drafter failed.");
    } finally {
      setLoadingDrafts(false);
    }
  }

  function pickDraft(text: string) {
    setBody(text);
    setDraftUsed(true);
    setDrafts(null); // collapse the chips after selection
    // Re-focus the textarea so the user can edit immediately.
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function dismissDrafts() {
    setDrafts(null);
    setDraftError(null);
  }

  // When the user types from scratch (no draft was picked), clear
  // draft_used so we don't false-positive the A/B signal.
  function handleTextChange(value: string) {
    setBody(value);
    if (!value.trim()) setDraftUsed(false);
  }

  // Reset state on submit so the next post starts fresh.
  function handleSubmit(_e: FormEvent<HTMLFormElement>) {
    // Don't preventDefault — the form action handles the submit.
    // We only reset *after* the framework processes the action; React 19
    // server actions don't expose a nice afterSubmit hook, so we just
    // optimistically clear here. If the action fails, the user can
    // re-type or re-draft.
    requestAnimationFrame(() => {
      setBody("");
      setDraftUsed(false);
      setDrafts(null);
      setDraftError(null);
    });
  }

  return (
    <div className="space-y-2">
      {/* Drafts panel — only rendered when we have drafts or an error. */}
      {(drafts !== null || draftError !== null || loadingDrafts) && (
        <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/60">
            <span>✨ AI draft suggestions</span>
            <button
              type="button"
              onClick={dismissDrafts}
              className="text-white/50 hover:text-white"
              aria-label="Dismiss drafts"
            >
              ×
            </button>
          </div>

          {loadingDrafts && (
            <p className="text-xs text-white/50">Drafting 3 options…</p>
          )}

          {draftError && (
            <p className="text-xs text-rose-300">{draftError}</p>
          )}

          {drafts && drafts.length > 0 && (
            <div className="grid gap-2">
              {drafts.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDraft(d)}
                  className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left text-sm text-white/85 transition hover:border-white/30 hover:bg-black/40"
                >
                  {d}
                </button>
              ))}
              <p className="text-xs text-white/50">
                Pick one to fill the box. You can still edit before
                posting.
              </p>
            </div>
          )}
        </div>
      )}

      <form
        action={addCommentAction}
        onSubmit={handleSubmit}
        className="flex items-start gap-2"
      >
        <input type="hidden" name="post_id" value={postId} />
        <input type="hidden" name="artist_slug" value={artistSlug} />
        <input
          type="hidden"
          name="draft_used"
          value={draftUsed ? "1" : "0"}
        />

        {/* ✨ trigger — left of the textarea, low-key chip styling. */}
        <button
          type="button"
          onClick={handleDraftClick}
          disabled={loadingDrafts}
          className="rounded-full border border-white/15 bg-black/30 px-3 py-2 text-xs text-white/70 hover:border-white/30 hover:bg-black/40 disabled:opacity-50"
          aria-label="Draft a reply with AI"
          title="Draft a reply with AI"
        >
          {loadingDrafts ? "…" : "✨"}
        </button>

        <textarea
          ref={textareaRef}
          name="body"
          required
          maxLength={1000}
          rows={2}
          value={body}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Add a comment… (+2 pts)"
          className="flex-1 resize-none rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
        />

        <SubmitButton />
      </form>
    </div>
  );
}

/** Submit button with disabled-while-pending state via useFormStatus. */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/90 hover:bg-white/15 disabled:opacity-50"
    >
      {pending ? "…" : "Post"}
    </button>
  );
}
