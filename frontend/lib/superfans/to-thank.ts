/**
 * "Superfans to thank" — pure selection over the last 30 days of per-fan
 * engagement in one community. No I/O, no clock reads beyond the `now`
 * passed in, so the Monday brief and the portal page rank the same way.
 *
 * Score (per fan, 30-day window):
 *   check-in     5   showed up in person
 *   RSVP         5   committed to show up
 *   comment      2   joined a conversation
 *   redemption   2   spent points on the artist (invested, not just earned)
 *   reaction     1   lightest touch
 *   points     +1 per 100 earned (ties the ledger in without letting a
 *                    points-rich lurker outrank a fan who shows up)
 *
 * Excluded: internal accounts (fans.is_internal) and fans thanked within
 * the last THANK_COOLDOWN_DAYS (superfan_thanks.thanked_at, 0095). Fans
 * with a score of 0 never appear — there is nothing to thank.
 */

export const THANK_COOLDOWN_DAYS = 60;
export const THANK_WINDOW_DAYS = 30;
export const DEFAULT_THANK_LIMIT = 10;

export const THANK_WEIGHTS = {
  checkins: 5,
  rsvps: 5,
  comments: 2,
  redemptions: 2,
  reactions: 1,
} as const;

export const POINTS_PER_THANK_POINT = 100;

export type EngagementKind = keyof typeof THANK_WEIGHTS;

export interface FanEngagement {
  fanId: string;
  pointsEarned: number;
  comments: number;
  reactions: number;
  checkins: number;
  rsvps: number;
  redemptions: number;
  /** ISO of the newest activity in the window, if any. */
  lastActiveAt: string | null;
}

export interface ThankCandidateInput extends FanEngagement {
  isInternal: boolean;
  /** ISO of the most recent superfan_thanks row for this fan, or null. */
  thankedAt: string | null;
}

export interface ScoreBreakdown {
  checkins: number;
  rsvps: number;
  comments: number;
  redemptions: number;
  reactions: number;
  points: number;
}

export interface ThankCandidate extends FanEngagement {
  score: number;
  breakdown: ScoreBreakdown;
  /** Whole days since `lastActiveAt`; null when there was no activity. */
  daysSinceActivity: number | null;
  thankedAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function engagementScore(e: FanEngagement): { score: number; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = {
    checkins: e.checkins * THANK_WEIGHTS.checkins,
    rsvps: e.rsvps * THANK_WEIGHTS.rsvps,
    comments: e.comments * THANK_WEIGHTS.comments,
    redemptions: e.redemptions * THANK_WEIGHTS.redemptions,
    reactions: e.reactions * THANK_WEIGHTS.reactions,
    points: Math.floor(Math.max(0, e.pointsEarned) / POINTS_PER_THANK_POINT),
  };
  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score, breakdown };
}

export function thankCooldownCutoffIso(now: Date, days = THANK_COOLDOWN_DAYS): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/**
 * Rank and pick the fans worth a thank-you. Stable: ties break on the
 * newer activity, then on fan id, so two renders of the same data agree.
 */
export function selectSuperfansToThank(
  fans: readonly ThankCandidateInput[],
  opts: { now: Date; limit?: number; cooldownDays?: number },
): ThankCandidate[] {
  const limit = Math.max(0, Math.floor(opts.limit ?? DEFAULT_THANK_LIMIT));
  const cutoff = thankCooldownCutoffIso(opts.now, opts.cooldownDays ?? THANK_COOLDOWN_DAYS);
  const out: ThankCandidate[] = [];
  for (const f of fans) {
    if (!f.fanId || f.isInternal) continue;
    if (f.thankedAt && f.thankedAt >= cutoff) continue;
    const { score, breakdown } = engagementScore(f);
    if (score <= 0) continue;
    out.push({
      ...f,
      score,
      breakdown,
      daysSinceActivity: daysSince(f.lastActiveAt, opts.now),
    });
  }
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const la = a.lastActiveAt ?? "";
    const lb = b.lastActiveAt ?? "";
    if (la !== lb) return lb.localeCompare(la);
    return a.fanId.localeCompare(b.fanId);
  });
  return out.slice(0, limit);
}

/** Human-readable legend, in one place so the page and the email agree. */
export function thankScoreLegend(): string {
  return (
    `${THANK_WEIGHTS.checkins} per check-in · ${THANK_WEIGHTS.rsvps} per RSVP · ` +
    `${THANK_WEIGHTS.comments} per comment · ${THANK_WEIGHTS.redemptions} per redemption · ` +
    `${THANK_WEIGHTS.reactions} per reaction · 1 per ${POINTS_PER_THANK_POINT} points earned`
  );
}

/**
 * A copy-ready thank-you the team can paste into a DM or comment. Names
 * the fan (first name only — it is going to them) and the artist.
 */
export function thankYouTemplate(input: { fanName: string; artistName: string }): string {
  const first = input.fanName.trim().split(/\s+/)[0] || "there";
  const artist = input.artistName.trim() || "the team";
  return (
    `Hey ${first} — just wanted to say thank you. You've been showing up for ${artist} ` +
    `week after week and it genuinely doesn't go unnoticed. Fans like you are the reason ` +
    `this community feels the way it does. More coming soon — glad you're here. 🙏`
  );
}
