/**
 * Display rules for the signed-out landing. Pure module, no imports, so it
 * can be unit tested and shared by the page and its components.
 *
 * The proof tiles (artists, shows, founding fans) stay hidden until the
 * numbers are big enough to help. Small counts like "1 artist" read as
 * thin, so the landing shows nothing rather than weak proof.
 */

export const PROOF_MIN_ARTISTS = 3;
export const PROOF_MIN_FOUNDING_FANS = 50;

const DAY_MS = 86_400_000;

export type ProofStats = {
  activeArtists: number;
  foundingFans: number;
};

export function shouldShowProofTiles(stats: ProofStats): boolean {
  return (
    stats.activeArtists >= PROOF_MIN_ARTISTS &&
    stats.foundingFans >= PROOF_MIN_FOUNDING_FANS
  );
}

/**
 * Whole days from `now` until `startsAt`, rounded down so a show later today
 * counts as 0 and one 24 to 48 hours out counts as 1. Returns null for a missing or bad
 * date, or a show that has already started.
 */
export function daysUntil(
  startsAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!startsAt) return null;
  const start = Date.parse(startsAt);
  if (Number.isNaN(start)) return null;
  const diff = start - now.getTime();
  if (diff < 0) return null;
  return Math.floor(diff / DAY_MS);
}

/** Short label for the countdown card: "Tonight", "Tomorrow", "In 3 days". */
export function countdownLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "Tonight";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}
