"use client";

import { useRef, useState } from "react";
import ImageUploader from "@/components/image-uploader";
import type { ChallengeEntry } from "@/lib/data/types";
import { submitEntryAction } from "./actions";

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const sec = Math.max(1, Math.floor((now - then) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ChallengeBlock({
  postId,
  artistSlug,
  entries,
  currentUserId,
}: {
  postId: string;
  artistSlug: string;
  entries: ChallengeEntry[];
  currentUserId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const alreadyEntered =
    currentUserId !== null &&
    entries.some((e) => e.fan_id === currentUserId);

  async function handleSubmit(formData: FormData) {
    setSubmitting(true);
    try {
      await submitEntryAction(formData);
      formRef.current?.reset();
      setUploaderKey((k) => k + 1);
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-white/50">
          🏆 Challenge · {entries.length}{" "}
          {entries.length === 1 ? "entry" : "entries"}
        </p>
        {currentUserId && !alreadyEntered && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-3 py-1 text-xs font-semibold text-white"
          >
            {open ? "Cancel" : "Submit entry · +3 pts"}
          </button>
        )}
        {currentUserId && alreadyEntered && (
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200">
            ✓ Entered
          </span>
        )}
      </div>

      {open && currentUserId && !alreadyEntered && (
        <form
          ref={formRef}
          action={handleSubmit}
          className="space-y-2 rounded-xl bg-black/40 p-3"
        >
          <input type="hidden" name="post_id" value={postId} />
          <input type="hidden" name="artist_slug" value={artistSlug} />
          <textarea
            name="body"
            maxLength={1000}
            rows={3}
            placeholder="Describe your entry (optional)…"
            className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:outline-none"
          />
          <ImageUploader
            key={uploaderKey}
            bucket="community-uploads"
            name="image_url"
            label="Add photo"
          />
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-xs font-semibold text-white shadow-glass disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit entry"}
            </button>
          </div>
        </form>
      )}

      {!currentUserId && (
        <p className="text-xs text-white/50">
          Sign in to submit an entry (+3 pts).
        </p>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.slice(0, 6).map((e) => (
            <div key={e.id} className="rounded-xl bg-black/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">
                  {e.fan_first_name ?? "Anonymous fan"}
                </p>
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {timeAgo(e.created_at)}
                </p>
              </div>
              {e.body && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">
                  {e.body}
                </p>
              )}
              {e.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.image_url}
                  alt=""
                  className="mt-2 max-h-72 w-full rounded-xl object-cover"
                />
              )}
            </div>
          ))}
          {entries.length > 6 && (
            <p className="text-xs text-white/50">
              + {entries.length - 6} more{" "}
              {entries.length - 6 === 1 ? "entry" : "entries"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
