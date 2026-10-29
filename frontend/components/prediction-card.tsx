"use client";

import { useEffect, useState, useTransition } from "react";
import { pushPointsToast } from "@/components/points-toast";
import {
  formatPredictionCountdown,
  predictionPhase,
  secondsUntilPredictionClose,
  type PredictionPhase,
  type PredictionPostFields,
} from "@/lib/predictions/types";
import {
  resolvePredictionAction,
  votePredictionAction,
} from "@/app/artists/[slug]/community/predictions-actions";

/**
 * PredictionCard — renders a single community_post where kind = 'prediction'.
 *
 * Three visual states driven by predictionPhase():
 *   - open      : voting buttons live, ticking countdown chip, no result
 *   - closed    : "Awaiting result" badge, vote buttons disabled
 *   - resolved  : correct option highlighted in green; viewer's own pick
 *                 marked ✓ or ✗; "+N pts" celebration if they got it right
 *
 * Reuses the existing community_poll_votes table for vote storage —
 * see lib/predictions/resolve.ts for the award flow.
 */

interface PredictionOption {
  id: string;
  label: string;
  votes: number;     // total votes for this option
}

interface PredictionCardProps {
  post: {
    id: string;
    artist_slug: string;
    title: string | null;
    body: string | null;
  } & PredictionPostFields;
  options: PredictionOption[];
  totalVotes: number;
  /** Viewer's chosen option id, if any. */
  viewerOptionId: string | null;
  /** True if viewer is the artist's super-admin and can resolve. */
  viewerIsAdmin: boolean;
}

function pickInterval(secondsLeft: number): number {
  if (secondsLeft <= 60 * 60) return 1_000;        // ≤1h: tick every 1s
  if (secondsLeft <= 24 * 60 * 60) return 60_000;  // ≤1d: tick every 60s
  return 60 * 60 * 1_000;                          // >1d: tick every 60m
}

export default function PredictionCard({
  post,
  options,
  totalVotes,
  viewerOptionId,
  viewerIsAdmin,
}: PredictionCardProps) {
  const [now, setNow] = useState<Date>(() => new Date());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolveTargetId, setResolveTargetId] = useState<string | null>(null);

  useEffect(() => {
    const initial = secondsUntilPredictionClose(post, new Date()) ?? 0;
    const interval = pickInterval(initial);
    const id = setInterval(() => setNow(new Date()), interval);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.prediction_closes_at, post.resolved_at]);

  const phase: PredictionPhase = predictionPhase(post, now);
  const secondsLeft = secondsUntilPredictionClose(post, now);
  const totalNonZero = totalVotes > 0 ? totalVotes : 1;

  function pctFor(opt: PredictionOption): number {
    return Math.round((opt.votes / totalNonZero) * 100);
  }

  async function vote(optionId: string) {
    setError(null);
    const fd = new FormData();
    fd.append("post_id", post.id);
    fd.append("option_id", optionId);
    fd.append("artist_slug", post.artist_slug);
    startTransition(async () => {
      const result = await votePredictionAction(fd);
      if (result?.error) setError(result.error);
      else if ("pointsAwarded" in result) pushPointsToast(result);
    });
  }

  async function resolve() {
    if (!resolveTargetId) return;
    setError(null);
    const fd = new FormData();
    fd.append("post_id", post.id);
    fd.append("correct_option_id", resolveTargetId);
    fd.append("artist_slug", post.artist_slug);
    startTransition(async () => {
      const result = await resolvePredictionAction(fd);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-rose-500/10 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-violet-500/25 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-violet-200">
            🔮 Prediction
          </span>
          {phase === "open" && secondsLeft !== null && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-200">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" aria-hidden />
              Closes in {formatPredictionCountdown(secondsLeft)}
            </span>
          )}
          {phase === "closed" && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/70">
              Awaiting result
            </span>
          )}
          {phase === "resolved" && (
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-200">
              ✓ Resolved
            </span>
          )}
        </div>
        {post.points_for_correct ? (
          <span className="text-xs font-semibold text-white/70">
            +{post.points_for_correct.toLocaleString()} pts
          </span>
        ) : null}
      </header>

      {post.title && (
        <h3 className="mt-3 text-base font-semibold text-white">
          {post.title}
        </h3>
      )}
      {post.body && (
        <p className="mt-1 text-sm text-white/75">{post.body}</p>
      )}

      {phase === "resolved" && viewerOptionId && viewerOptionId === post.correct_option_id && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200">
          <span aria-hidden>🎉</span>
          <span>You called it!{post.points_for_correct ? " +" + post.points_for_correct + " pts awarded." : ""}</span>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {options.map((opt) => {
          const isCorrect =
            phase === "resolved" && post.correct_option_id === opt.id;
          const viewerChose = viewerOptionId === opt.id;
          const pct = pctFor(opt);

          // Per-row styling: green if correct, red if viewer's wrong pick,
          // aurora ring if viewer's currently-active vote in open phase.
          const rowClass = isCorrect
            ? "border-emerald-400/50 bg-emerald-500/15"
            : phase === "resolved" && viewerChose
              ? "border-rose-400/40 bg-rose-500/10"
              : viewerChose
                ? "border-aurora/40 bg-aurora/10"
                : "border-white/10 bg-white/3 hover:border-white/25";

          const canVote = phase === "open" && !pending;

          return (
            <li key={opt.id}>
              <button
                type="button"
                disabled={!canVote}
                onClick={() => canVote && vote(opt.id)}
                className={`relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition ${rowClass} ${
                  !canVote ? "cursor-default" : "cursor-pointer"
                }`}
              >
                {/* result distribution bar — always visible after resolution,
                    or during open phase to show the current split */}
                {(phase !== "open" || totalVotes > 0) && (
                  <div
                    aria-hidden
                    className={`pointer-events-none absolute inset-y-0 left-0 ${
                      isCorrect
                        ? "bg-emerald-400/15"
                        : phase === "resolved" && viewerChose
                          ? "bg-rose-400/15"
                          : "bg-white/5"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                )}

                <span className="relative flex items-center gap-2 text-sm font-medium text-white">
                  {isCorrect && <span aria-hidden>✓</span>}
                  {phase === "resolved" && viewerChose && !isCorrect && (
                    <span aria-hidden>✗</span>
                  )}
                  {viewerChose && phase === "open" && (
                    <span aria-hidden>•</span>
                  )}
                  {opt.label}
                </span>

                <span className="relative whitespace-nowrap text-xs tabular-nums text-white/65">
                  {pct}% · {opt.votes}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-xs text-white/55">
        {totalVotes.toLocaleString()} vote{totalVotes === 1 ? "" : "s"}
        {phase === "resolved" && post.points_for_correct
          ? ` · winners earned +${post.points_for_correct} pts`
          : ""}
      </p>

      {/* Admin resolution panel — only renders when admin viewing & not yet resolved */}
      {viewerIsAdmin && phase !== "resolved" && (
        <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-200">
            Admin · resolve prediction
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              className="flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
              value={resolveTargetId ?? ""}
              onChange={(e) => setResolveTargetId(e.target.value || null)}
            >
              <option value="">Pick correct option…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!resolveTargetId || pending}
              onClick={resolve}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Resolving…" : "Resolve & award"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-rose-300">⚠ {error}</p>
      )}
    </article>
  );
}
