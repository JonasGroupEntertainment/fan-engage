import type { AdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { canResolvePrediction } from "./authz";

/**
 * Resolve a prediction by marking the correct option, then batch-award
 * `points_for_correct` to every fan who voted for it.
 *
 * Idempotent: points go through apply_points_award() with a per-fan
 * source_ref, which pays each ref once, and `prediction_award_log`
 * lets a rerun (e.g., admin re-clicks the resolve button) skip fans
 * that were already paid.
 *
 * Returns counts so the caller can render a confirmation toast.
 *
 * Guards (checked here so every caller gets them):
 *   - the admin must be allowed to resolve for the prediction's own
 *     community (read from the DB row, not the form);
 *   - the chosen option must belong to this prediction;
 *   - once resolved, the answer is locked. A rerun with the same option
 *     only finishes any awards that failed; a different option is refused.
 *
 * Failure mode: throws if the post isn't a prediction or doesn't exist.
 * Award errors per-fan are logged but don't abort the batch — partial
 * awards persist (the per-fan source_ref makes a retry safe).
 */
export async function resolvePrediction(opts: {
  postId: string;
  correctOptionId: string;
  ctx: AdminContext | null;
}): Promise<{
  alreadyResolved: boolean;
  pointsPerWinner: number;
  winnersCount: number;
  awardedCount: number;
  skippedCount: number;
}> {
  const admin = createAdminClient();

  // Load the prediction row
  const { data: post } = await admin
    .from("community_posts")
    .select(
      "id, kind, points_for_correct, resolved_at, correct_option_id, artist_slug",
    )
    .eq("id", opts.postId)
    .maybeSingle();

  if (!post) throw new Error("prediction not found");
  if (post.kind !== "prediction") throw new Error("post is not a prediction");
  if (!canResolvePrediction(opts.ctx, post.artist_slug as string | null)) {
    throw new Error("not_allowed");
  }

  const { data: option } = await admin
    .from("community_poll_options")
    .select("id")
    .eq("id", opts.correctOptionId)
    .eq("post_id", opts.postId)
    .maybeSingle();
  if (!option) throw new Error("option does not belong to this prediction");

  const points = (post.points_for_correct as number | null) ?? 0;
  let alreadyResolved = post.resolved_at != null;

  // Stamp resolution once. The resolved_at IS NULL filter makes two
  // concurrent first resolves race safely: only one row update wins.
  if (!alreadyResolved) {
    const { data: stamped, error } = await admin
      .from("community_posts")
      .update({
        correct_option_id: opts.correctOptionId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", opts.postId)
      .is("resolved_at", null)
      .select("id");
    if (error) throw error;
    if (!stamped || stamped.length === 0) alreadyResolved = true;
  }

  if (alreadyResolved) {
    const { data: current } = await admin
      .from("community_posts")
      .select("correct_option_id")
      .eq("id", opts.postId)
      .maybeSingle();
    if (current?.correct_option_id !== opts.correctOptionId) {
      throw new Error("prediction already resolved with a different answer");
    }
  }

  // Find winning voters
  const { data: winnerRows } = await admin
    .from("community_poll_votes")
    .select("fan_id")
    .eq("post_id", opts.postId)
    .eq("option_id", opts.correctOptionId);

  const winnerIds = Array.from(
    new Set((winnerRows ?? []).map((r) => r.fan_id as string)),
  );
  const winnersCount = winnerIds.length;
  if (winnersCount === 0 || points <= 0) {
    return {
      alreadyResolved,
      pointsPerWinner: points,
      winnersCount,
      awardedCount: 0,
      skippedCount: 0,
    };
  }

  // Already-awarded fans (rerun safety)
  const { data: alreadyAwardedRows } = await admin
    .from("prediction_award_log")
    .select("fan_id")
    .eq("post_id", opts.postId);
  const alreadyAwarded = new Set<string>(
    (alreadyAwardedRows ?? []).map((r) => r.fan_id as string),
  );

  const toAward = winnerIds.filter((id) => !alreadyAwarded.has(id));
  let awardedCount = 0;
  const skippedCount = winnerIds.length - toAward.length;

  // Award one fan at a time so a single failure doesn't abort the batch.
  // Volume is bounded (winners per prediction); fine for V1.
  for (const fanId of toAward) {
    try {
      // 1. Pay through apply_points_award(): it locks the fan, skips a
      //    source_ref it has already seen (so a concurrent or repeated
      //    resolve pays once), writes the ledger row, applies the Founding
      //    Fan multiplier, and resyncs totals from the ledger. The ref is
      //    per fan because the dedupe looks at source_ref alone.
      const { data: paid, error: awardErr } = await admin.rpc(
        "apply_points_award",
        {
          p_fan_id: fanId,
          p_base_delta: points,
          p_source: "prediction_correct",
          p_source_ref: predictionAwardRef(opts.postId, fanId),
          p_community_id: post.artist_slug as string | null,
          p_note: "Correct prediction",
        },
      );
      if (awardErr) throw awardErr;

      // 2. Record the award for the rerun check above. A duplicate here
      //    (23505) means a concurrent resolve already logged it.
      const { error: logErr } = await admin.from("prediction_award_log").insert({
        post_id: opts.postId,
        fan_id: fanId,
        points: (paid as number | null) ?? points,
        metadata: { kind: "prediction_correct" },
      });
      if (logErr && logErr.code !== "23505") {
        console.warn("resolvePrediction: award log insert failed", fanId, logErr);
      }

      if (((paid as number | null) ?? 0) > 0) awardedCount += 1;
    } catch (err) {
      console.warn("resolvePrediction: award failed for fan", fanId, err);
    }
  }

  return {
    alreadyResolved,
    pointsPerWinner: points,
    winnersCount,
    awardedCount,
    skippedCount,
  };
}

/** Ledger source_ref for one fan's payout on one prediction. */
export function predictionAwardRef(postId: string, fanId: string): string {
  return `prediction:${postId}:${fanId}`;
}

/**
 * Convenience aggregate query for the prediction card render path.
 * Returns vote distribution + the viewer's option id (if any).
 */
export async function getPredictionState(
  postId: string,
  viewerFanId?: string | null,
): Promise<{
  totalVotes: number;
  countsByOption: Record<string, number>;
  viewerOptionId: string | null;
}> {
  const admin = createAdminClient();
  const [{ data: voteRows }, { data: myVote }] = await Promise.all([
    admin
      .from("community_poll_votes")
      .select("option_id")
      .eq("post_id", postId),
    viewerFanId
      ? admin
          .from("community_poll_votes")
          .select("option_id")
          .eq("post_id", postId)
          .eq("fan_id", viewerFanId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const countsByOption: Record<string, number> = {};
  for (const v of voteRows ?? []) {
    const oid = v.option_id as string;
    countsByOption[oid] = (countsByOption[oid] ?? 0) + 1;
  }

  return {
    totalVotes: (voteRows ?? []).length,
    countsByOption,
    viewerOptionId: (myVote?.option_id as string | undefined) ?? null,
  };
}
