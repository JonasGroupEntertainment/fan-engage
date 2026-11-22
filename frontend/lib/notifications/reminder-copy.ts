/**
 * Wording for the leaderboard and drop reminders, for push and for the
 * inbox copy. Pure: no env, no Supabase, no imports.
 *
 * `body` is the push line, read within minutes. `inboxBody` is read
 * later, so it names no "now", "just" or minutes left.
 */

export type ReminderCopy = {
  title: string;
  body: string;
  inboxBody: string;
  url: string;
};

const DESCRIPTION_MAX = 80;
const COMMUNITY_FALLBACK_URL = "/community";
const HOW_TO_SCORE =
  "Check-ins, RSVPs, shares, posts, comments and reactions all add to your score.";

/** The artist's monthly leaderboard, or the community resolver without a slug. */
export function leaderboardUrl(artistSlug: string | null | undefined): string {
  const slug = artistSlug?.trim();
  return slug ? `/artists/${slug}/leaderboard` : COMMUNITY_FALLBACK_URL;
}

export function overtakenCopy(input: {
  artistName: string;
  artistSlug?: string | null;
  newRank: number;
}): ReminderCopy {
  return {
    title: `You dropped to #${input.newRank} on ${input.artistName}`,
    body: "Someone passed you since yesterday. Earn points to climb back up.",
    inboxBody: `Someone passed you on this month's leaderboard. ${HOW_TO_SCORE}`,
    url: leaderboardUrl(input.artistSlug),
  };
}

export function firstPlaceCopy(input: {
  artistName: string;
  artistSlug?: string | null;
}): ReminderCopy {
  return {
    title: `You're #1 on ${input.artistName}! 🥇`,
    body: "Keep it up to hold the top spot through the end of the month.",
    inboxBody: `You reached the top of this month's leaderboard. ${HOW_TO_SCORE}`,
    url: leaderboardUrl(input.artistSlug),
  };
}

function daysLeftTitle(daysLeft: number, artistName: string): string {
  if (daysLeft <= 0) return `Last day on ${artistName} this month`;
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left on ${artistName}`;
}

export function monthEndNudgeCopy(input: {
  artistName: string;
  artistSlug?: string | null;
  rank: number;
  daysLeft: number;
}): ReminderCopy {
  return {
    title: daysLeftTitle(input.daysLeft, input.artistName),
    body: `You're at #${input.rank}. Final push to lock in your spot before the month resets!`,
    inboxBody: `You were at #${input.rank} when this was sent. The leaderboard starts over when the month ends. ${HOW_TO_SCORE}`,
    url: leaderboardUrl(input.artistSlug),
  };
}

function shortDescription(description: string | null | undefined): string | null {
  const cleaned = String(description ?? "").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, DESCRIPTION_MAX) : null;
}

export function dropLaunchedCopy(input: {
  artistName: string;
  artistSlug: string;
  rewardTitle: string;
  rewardDescription?: string | null;
}): ReminderCopy {
  const description = shortDescription(input.rewardDescription);
  return {
    title: `${input.artistName}: new drop`,
    body: description
      ? `${input.rewardTitle}: ${description}`
      : `${input.rewardTitle} just dropped.`,
    inboxBody: description
      ? `${input.rewardTitle}: ${description}`
      : `${input.rewardTitle} is a limited-time drop. Redeem it while it is open.`,
    url: `/artists/${input.artistSlug}/rewards`,
  };
}

export function dropExpiringCopy(input: {
  artistSlug: string;
  rewardTitle: string;
  minutesLeft: number;
}): ReminderCopy {
  const minutes = Math.max(1, Math.round(input.minutesLeft));
  return {
    title: `${input.rewardTitle} ends soon`,
    body: `Last ${minutes} min to redeem this drop.`,
    inboxBody:
      "This limited-time drop was about to close when this was sent. If it is still open, redeem it before it is gone.",
    url: `/artists/${input.artistSlug}/rewards`,
  };
}
