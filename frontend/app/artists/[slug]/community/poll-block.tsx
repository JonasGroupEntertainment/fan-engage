"use client";

import type { PollData } from "@/lib/data/types";
import { votePollAction } from "./actions";

export default function PollBlock({
  postId,
  artistSlug,
  poll,
  currentUserId,
}: {
  postId: string;
  artistSlug: string;
  poll: PollData;
  currentUserId: string | null;
}) {
  const total = poll.total_votes;
  const hasVoted = poll.my_option_id !== null;

  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs uppercase tracking-wide text-white/50">
        📊 Poll · {total} {total === 1 ? "vote" : "votes"}
        {hasVoted && " · you voted"}
      </p>
      <div className="space-y-2">
        {poll.options.map((o) => {
          const pct = total > 0 ? Math.round((o.vote_count / total) * 100) : 0;
          const mine = poll.my_option_id === o.id;
          return (
            <form
              key={o.id}
              action={votePollAction}
              className="relative"
            >
              <input type="hidden" name="post_id" value={postId} />
              <input type="hidden" name="option_id" value={o.id} />
              <input type="hidden" name="artist_slug" value={artistSlug} />
              <button
                type="submit"
                disabled={!currentUserId}
                className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition ${
                  mine
                    ? "border-aurora/60 bg-aurora/20 text-white"
                    : "border-white/10 bg-black/40 text-white/80 hover:bg-black/60"
                } disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <span
                  className="absolute inset-y-0 left-0 bg-white/10"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
                <span className="relative flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {mine && "✓ "}
                    {o.label}
                  </span>
                  <span className="text-xs text-white/70">
                    {o.vote_count} · {pct}%
                  </span>
                </span>
              </button>
            </form>
          );
        })}
      </div>
      {!currentUserId && (
        <p className="text-xs text-white/50">Sign in to vote (+10 pts).</p>
      )}
      {currentUserId && !hasVoted && (
        <p className="text-xs text-white/50">
          Tap an option to cast your vote (+10 pts).
        </p>
      )}
      {currentUserId && hasVoted && (
        <p className="text-xs text-white/50">
          Tap a different option to change your vote.
        </p>
      )}
    </div>
  );
}
