"use client";

import { useState, useCallback } from "react";
import type {
  ChallengeEntry,
  CommunityComment,
  CommunityPost,
  PollData,
} from "@/lib/data/types";
import ModerationChip from "@/components/community/moderation-chip";
import CommentComposer from "./comment-composer";
import {
  deletePostAction,
  togglePinAction,
  toggleReactionAction,
} from "./actions";
import PollBlock from "./poll-block";
import ChallengeBlock from "./challenge-block";
import { relativeTime } from "@/lib/format/relative-time";
import { withPointsToast } from "@/components/points-toast";

const REACTION_SET = ["❤️", "🔥", "👏", "💯", "😂"] as const;

function KindBadge({ kind }: { kind: CommunityPost["kind"] }) {
  if (kind === "announcement") {
    return (
      <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-sky-200">
        📢 Announcement
      </span>
    );
  }
  if (kind === "poll") {
    return (
      <span className="rounded-full bg-fuchsia-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-fuchsia-200">
        📊 Poll
      </span>
    );
  }
  if (kind === "challenge") {
    return (
      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-200">
        🏆 Challenge
      </span>
    );
  }
  return null;
}

/**
 * Artist / team byline. Announcements read as the artist ("RaeLynn");
 * team-grant posts of any other kind read as "RaeLynn's team". Both carry
 * the accent-gradient chip so fans can tell official posts from fan posts
 * at a glance. Fan posts keep the author's first name.
 */
function AuthorByline({
  post,
  teamByline,
}: {
  post: CommunityPost;
  teamByline: string | null;
}) {
  if (!teamByline) {
    return (
      <p className="text-sm font-semibold">
        {post.author_first_name ?? "Anonymous fan"}
      </p>
    );
  }
  const name = post.kind === "announcement" ? teamByline : `${teamByline}'s team`;
  return (
    <p className="flex items-center gap-2 text-sm font-semibold">
      <span>{name}</span>
      <span
        title={`Official post from ${teamByline}'s team`}
        className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-aurora to-ember px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-glass"
      >
        <span aria-hidden>✓</span> Artist
      </span>
    </p>
  );
}

export default function PostCard({
  post,
  initialComments,
  isAuthor,
  isAdmin,
  currentUserId,
  canReply = false,
  canReact = false,
  teamByline = null,
  poll,
  challengeEntries,
}: {
  post: CommunityPost;
  initialComments: CommunityComment[];
  isAuthor: boolean;
  isAdmin: boolean;
  currentUserId: string | null;
  canReply?: boolean;
  canReact?: boolean;
  /** Artist display name when the post is team-authored (see getTeamAuthoredPostIds); null for fan posts. */
  teamByline?: string | null;
  poll?: PollData | null;
  challengeEntries?: ChallengeEntry[];
}) {
  const [showComments, setShowComments] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app";
    const postUrl = `${appUrl}/artists/${post.artist_slug}/community?post=${post.id}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({ title: post.title ?? "Check this out", url: postUrl });
        return;
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(postUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {}
  }, [post.id, post.artist_slug, post.title]);

  const accentRing =
    post.kind === "announcement"
      ? "ring-1 ring-sky-400/40"
      : post.pinned
        ? "ring-1 ring-amber-400/40"
        : "";

  return (
    <article className={`glass-card space-y-3 p-5 ${accentRing}`}>

      {post.moderation_status === "auto_hide" && (
        <ModerationChip message={post.moderation_user_message ?? null} />
      )}
      <header className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <AuthorByline post={post} teamByline={teamByline} />
            <KindBadge kind={post.kind} />
          </div>
          <p className="text-xs text-white/50">{relativeTime(post.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          {post.pinned && (
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-amber-200">
              Pinned
            </span>
          )}
          {isAdmin && (
            <form action={togglePinAction}>
              <input type="hidden" name="post_id" value={post.id} />
              <input type="hidden" name="artist_slug" value={post.artist_slug} />
              <input type="hidden" name="currently_pinned" value={String(post.pinned)} />
              <button className="text-xs text-white/60 hover:text-white">
                {post.pinned ? "Unpin" : "Pin"}
              </button>
            </form>
          )}
          {(isAuthor || isAdmin) && (
            <form action={deletePostAction}>
              <input type="hidden" name="post_id" value={post.id} />
              <input type="hidden" name="artist_slug" value={post.artist_slug} />
              <button className="text-xs text-rose-300/80 hover:text-rose-300">
                Delete
              </button>
            </form>
          )}
        </div>
      </header>

      {post.title && (
        <h2
          className="text-xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {post.title}
        </h2>
      )}

      <p className="whitespace-pre-wrap text-sm text-white/90">{post.body}</p>

      {post.video_url ? (
        <video
          controls
          poster={post.video_poster_url ?? undefined}
          preload="metadata"
          playsInline
          className="mt-3 w-full rounded-2xl border border-white/10"
        >
          <source src={post.video_url} />
        </video>
      ) : (
        post.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.image_url}
            alt={post.image_alt ?? ""}
            className="max-h-96 w-full rounded-2xl object-cover"
          />
        )
      )}

      {post.kind === "poll" && poll && (
        <PollBlock
          postId={post.id}
          artistSlug={post.artist_slug}
          poll={poll}
          currentUserId={currentUserId}
          canVote={canReact}
        />
      )}

      {post.kind === "challenge" && (
        <ChallengeBlock
          postId={post.id}
          artistSlug={post.artist_slug}
          entries={challengeEntries ?? []}
          currentUserId={currentUserId}
          canEnter={canReply}
        />
      )}

      {/* AI #14: thread summary for posts with active discussion */}
      {post.thread_summary && post.comment_count >= 8 && (
        <div className="rounded-2xl border border-aurora/30 bg-aurora/5 p-3">
          <p className="mb-1 flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-aurora">
            <span aria-hidden>✨</span> What people are saying
          </p>
          <p className="text-sm text-white/85">{post.thread_summary}</p>
        </div>
      )}

      {/* Reactions — Free for every signed-in fan; counts stay visible to
          guests, who get a sign-in door instead of a Premium lock. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
        {REACTION_SET.map((emoji) => {
          const count = post.reaction_counts[emoji] ?? 0;
          const mine = post.my_reactions.includes(emoji);
          if (!canReact || !currentUserId) {
            return (
              <a
                key={emoji}
                href={`/login?next=${encodeURIComponent(`/artists/${post.artist_slug}/community`)}`}
                title="Sign in to react"
                className="flex items-center gap-1 rounded-full border border-white/10 bg-black/30 px-3 py-1 text-sm text-white/70 hover:bg-black/50"
              >
                <span>{emoji}</span>
                {count > 0 && <span className="text-xs">{count}</span>}
              </a>
            );
          }
          return (
            <form key={emoji} action={withPointsToast(toggleReactionAction)}>
              <input type="hidden" name="post_id" value={post.id} />
              <input type="hidden" name="artist_slug" value={post.artist_slug} />
              <input type="hidden" name="emoji" value={emoji} />
              <button
                type="submit"
                disabled={!currentUserId}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition ${
                  mine
                    ? "border-aurora/60 bg-aurora/20 text-white"
                    : "border-white/10 bg-black/30 text-white/70 hover:bg-black/50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <span>{emoji}</span>
                {count > 0 && <span className="text-xs">{count}</span>}
              </button>
            </form>
          );
        })}
        <button
          onClick={() => setShowComments((v) => !v)}
          className="ml-auto rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70 hover:bg-black/50"
        >
          💬 {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}
        </button>
        <button
          onClick={handleShare}
          title="Share this post"
          className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-xs text-white/70 hover:bg-black/50 transition"
        >
          {shareCopied ? "✓ Copied" : "↗ Share"}
        </button>
      </div>

      {showComments && (
        <div className="space-y-3 border-t border-white/5 pt-3">
          {initialComments.length === 0 && (
            <p className="text-xs text-white/50">
              No comments yet — be the first.
            </p>
          )}
          {initialComments.map((c) => (
            <div key={c.id} className="rounded-2xl bg-black/30 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">
                  {c.author_first_name ?? "Anonymous fan"}
                </p>
                <p className="text-xs uppercase tracking-wide text-white/50">
                  {relativeTime(c.created_at)}
                </p>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">
                {c.body}
              </p>
            </div>
          ))}
          {/* Replies are Free (+10 pts, up to 5/day via the SQL trigger). */}
          {currentUserId && canReply && (
            <CommentComposer postId={post.id} artistSlug={post.artist_slug} />
          )}
        </div>
      )}
    </article>
  );
}
