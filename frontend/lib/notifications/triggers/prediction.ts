import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "../send";

/**
 * Fire a push notification to every voter on a prediction when it's
 * resolved. Two messages depending on whether the fan was correct:
 *
 *   correct:    "🎯 You got it! +N pts"
 *   incorrect:  "Prediction resolved — see the result"
 *
 * Reuses the Phase 2 `notify_drops` opt-in bucket for V1 (the bucket
 * is essentially "time-sensitive content from artists you follow").
 * Splitting predictions into their own preference column is a V2
 * UX refinement, not a V1 blocker.
 */
export async function notifyPredictionResolved(opts: {
  postId: string;
  artistSlug: string;
  correctOptionId: string;
  pointsPerWinner: number;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const [{ data: post }, { data: artist }, { data: option }] =
      await Promise.all([
        admin
          .from("community_posts")
          .select("title, visibility")
          .eq("id", opts.postId)
          .maybeSingle(),
        admin
          .from("artists")
          .select("name")
          .eq("slug", opts.artistSlug)
          .maybeSingle(),
        admin
          .from("community_poll_options")
          .select("label")
          .eq("id", opts.correctOptionId)
          .maybeSingle(),
      ]);

    if (!post) return;
    const artistName = (artist?.name as string | undefined) ?? opts.artistSlug;
    const correctLabel =
      (option?.label as string | undefined) ?? "the right answer";

    // All voters
    const { data: voteRows } = await admin
      .from("community_poll_votes")
      .select("fan_id, option_id")
      .eq("post_id", opts.postId);

    const seen = new Set<string>();
    const correctVoters: string[] = [];
    const incorrectVoters: string[] = [];
    for (const v of voteRows ?? []) {
      const fid = v.fan_id as string;
      if (seen.has(fid)) continue;
      seen.add(fid);
      if (v.option_id === opts.correctOptionId) correctVoters.push(fid);
      else incorrectVoters.push(fid);
    }

    const promptTitle = (post.title as string | null) ?? "Prediction";
    const gated = (post.visibility as string | null) != null && post.visibility !== "public";
    const reveal = gated
      ? `${artistName} resolved a prediction. Open the community to see it.`
      : `The answer was: ${correctLabel}`;
    const url = `/artists/${opts.artistSlug}/community#post-${opts.postId}`;

    const MAX_CONCURRENT = 200;
    await Promise.all([
      // Correct voters get the celebration
      ...correctVoters.slice(0, MAX_CONCURRENT).map((fanId) =>
        sendNotification({
          fanId,
          type: "drops",
          payload: {
            title: `🎯 You got it! ${promptTitle}`,
            body:
              opts.pointsPerWinner > 0
                ? `+${opts.pointsPerWinner} pts. ${artistName} just resolved this prediction.`
                : `${artistName} just resolved this prediction.`,
            url,
            tag: `prediction:${opts.postId}`,
          },
        }),
      ),
      // Incorrect voters get the reveal
      ...incorrectVoters.slice(0, MAX_CONCURRENT).map((fanId) =>
        sendNotification({
          fanId,
          type: "drops",
          payload: {
            title: `${artistName} resolved a prediction`,
            body: reveal,
            url,
            tag: `prediction:${opts.postId}`,
          },
        }),
      ),
    ]);
  } catch (err) {
    console.warn("notifyPredictionResolved failed (non-blocking):", err);
  }
}
