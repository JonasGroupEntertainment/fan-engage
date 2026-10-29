/**
 * Per-artist monthly leaderboard. Scored by community activity, not raw
 * points_ledger totals — points_ledger isn't tied to an artist on the
 * row, and most points come from cross-cutting events (signup bonus,
 * streak bonuses) that wouldn't make sense to attribute to one artist.
 *
 * Activity score weights live in `./score.ts` (SCORE_WEIGHTS) — that is
 * the single source of truth; the page legend is rendered from it.
 *
 *   check-ins:   5 pts
 *   RSVPs:       5 pts
 *   shares:      3 pts
 *   posts:       3 pts
 *   comments:    2 pts
 *   reactions:   1 pt
 *   redemptions: 0 — spending points no longer moves the chart.
 */

export interface LeaderboardEntry {
  fan_id: string;
  rank: number;            // 1-based; ties resolved by fan id for stability
  display_name: string;
  avatar_url: string | null;
  /** Public profile slug for linking to /fans/[slug]; null if the fan has opted out. */
  profile_slug: string | null;
  current_tier: string | null;
  score: number;
  /** Activity breakdown — useful for the "what counts" tooltip on the page. */
  reactions: number;
  comments: number;
  posts: number;
  shares: number;
  rsvps: number;
  checkins: number;
}

export interface ArtistMonthlyLeaderboard {
  /** ISO date of the first day of the month, in UTC. */
  monthStart: string;
  monthLabel: string;      // e.g., "May 2026"
  artistSlug: string;
  artistName: string;
  /** Top entries, capped (typically 10). */
  top: LeaderboardEntry[];
  /** Viewer's own entry — null when viewer isn't signed in or hasn't engaged. */
  viewerEntry: LeaderboardEntry | null;
  /** Total fans with any activity this month — used to render "you're #47 of 312". */
  totalFans: number;
}
