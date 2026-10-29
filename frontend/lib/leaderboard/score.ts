/**
 * Pure scoring for the per-artist monthly leaderboard. No I/O here so the
 * weights and the aggregation can be unit-tested without Supabase.
 *
 * Weights (Sprint 2 reweight):
 *   check-in     5  — showed up in person, strongest intent signal
 *   RSVP         5  — committed to show up
 *   share        3  — brought someone else in
 *   post         3  — started a conversation
 *   comment      2  — joined a conversation
 *   reaction     1  — lightest touch
 *   redemption   0  — spending points is not fandom; redemptions no
 *                     longer score (they used to be 10) so a fan who
 *                     cashes in a reward neither gains nor loses rank.
 */
export const SCORE_WEIGHTS = {
  checkin: 5,
  rsvp: 5,
  share: 3,
  post: 3,
  comment: 2,
  reaction: 1,
  redemption: 0,
} as const;

export type ActivityKind = keyof typeof SCORE_WEIGHTS;

export const ACTIVITY_KINDS = Object.keys(SCORE_WEIGHTS) as ActivityKind[];

export interface ActivityEvent {
  fanId: string;
  kind: ActivityKind;
}

export interface FanScore {
  score: number;
  counts: Record<ActivityKind, number>;
}

export function emptyCounts(): Record<ActivityKind, number> {
  const counts = {} as Record<ActivityKind, number>;
  for (const kind of ACTIVITY_KINDS) counts[kind] = 0;
  return counts;
}

/**
 * Fold a flat list of activity events into a per-fan score map. Pure:
 * same events in → same map out, no clock, no I/O. Events for an unknown
 * kind are ignored rather than thrown so a stale caller cannot take the
 * board down.
 */
export function aggregateScores(
  events: Iterable<ActivityEvent>,
  weights: Record<ActivityKind, number> = SCORE_WEIGHTS,
): Map<string, FanScore> {
  const scores = new Map<string, FanScore>();
  for (const ev of events) {
    if (!ev.fanId || !(ev.kind in weights)) continue;
    const cur = scores.get(ev.fanId) ?? { score: 0, counts: emptyCounts() };
    cur.counts[ev.kind] += 1;
    cur.score += weights[ev.kind];
    scores.set(ev.fanId, cur);
  }
  return scores;
}

/**
 * Sort fans by score desc; ties broken by fan id so the order is stable
 * between renders. Returns [fanId, FanScore] pairs.
 */
export function rankScores(scores: Map<string, FanScore>): Array<[string, FanScore]> {
  return Array.from(scores.entries()).sort((a, b) => {
    if (b[1].score !== a[1].score) return b[1].score - a[1].score;
    return a[0].localeCompare(b[0]);
  });
}

/** Human-readable legend, kept in one place so UI copy cannot drift. */
export function scoreLegend(weights: Record<ActivityKind, number> = SCORE_WEIGHTS): string {
  const label: Record<ActivityKind, string> = {
    checkin: "check-in",
    rsvp: "RSVP",
    share: "share",
    post: "post",
    comment: "comment",
    reaction: "reaction",
    redemption: "redemption",
  };
  return ACTIVITY_KINDS.filter((k) => weights[k] > 0)
    .map((k) => `${weights[k]} pt${weights[k] === 1 ? "" : "s"} per ${label[k]}`)
    .join(" · ");
}
