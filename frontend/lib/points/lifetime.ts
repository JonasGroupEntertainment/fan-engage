import { createAdminClient } from "@/lib/supabase/admin";
import { pointsProgress, type PointsProgress } from "./progress";

/**
 * Server-side helpers for "progress at action".
 *
 * Points are awarded by SQL triggers (try_award_comment_points,
 * try_award_poll_points, award_community_post_points …), not by the server
 * actions, so an action cannot know what it earned without asking the DB.
 * The cheapest honest answer is to read fans.lifetime_points (0085) before
 * and after the write: lifetime only ever grows, and every award path funnels
 * through the fans_update_tier trigger that maintains it.
 *
 * Falls back to 0 when the column is missing (0085 not applied) or the read
 * fails, so the action itself never breaks because of the toast.
 */
export async function readLifetimePoints(fanId: string): Promise<number | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("fans")
      .select("lifetime_points, total_points")
      .eq("id", fanId)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { lifetime_points?: number | null; total_points?: number | null };
    return Math.max(row.lifetime_points ?? 0, row.total_points ?? 0, 0);
  } catch {
    return null;
  }
}

/**
 * Run `write` between two lifetime readings and return the progress payload.
 * The write's own result is returned alongside so callers keep their
 * existing fields.
 */
export async function withPointsProgress<T>(
  fanId: string,
  write: () => PromiseLike<T>,
): Promise<{ result: T; progress: PointsProgress }> {
  const before = await readLifetimePoints(fanId);
  const result = await write();
  const after = before === null ? null : await readLifetimePoints(fanId);
  // A failed read on either side would make the delta look like the whole
  // lifetime ("+5,000 pts"); report no award instead so no toast shows.
  const progress =
    before === null || after === null
      ? pointsProgress(after ?? 0, after ?? 0)
      : pointsProgress(before, after);
  return { result, progress };
}
