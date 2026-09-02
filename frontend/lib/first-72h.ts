/**
 * Canonical First 72 hours program.
 *
 * Source of truth is the /referrals card:
 *   "Follow one artist, earn a first badge, then invite one friend
 *    while the experience is fresh."
 *
 * Home + onboarding reuse this same program (plus complete-profile as
 * the first-session opener). Do not invent a second ladder.
 */

export const FIRST_72H_TITLE = "First 72 hours";

export const FIRST_72H_BODY =
  "Follow one artist, earn a first badge, then invite one friend while the experience is fresh.";

export const FIRST_72H_STEPS = [
  {
    id: "profile",
    title: "Complete your profile",
    description: "Name and interests so the experience can personalize immediately.",
    href: "/onboarding",
    cta: "Complete profile",
  },
  {
    id: "follow",
    title: "Follow one artist",
    description: "Join the community while the experience is fresh.",
    href: "/artists",
    cta: "Browse artists",
  },
  {
    id: "badge",
    title: "Earn a first badge",
    description: "Make your first points move — check in, post, or redeem a digital unlock.",
    href: "/rewards",
    cta: "Earn or redeem",
  },
  {
    id: "invite",
    title: "Invite one friend",
    description: "Share your invite while the experience is fresh.",
    href: "/referrals",
    cta: "Invite a friend",
  },
] as const;

export type First72hStepId = (typeof FIRST_72H_STEPS)[number]["id"];

export const REFERRAL_REWARD_LADDER = [
  { level: "1 referral", reward: "+150 pts", threshold: 1 },
  { level: "3 referrals", reward: "Recruiter badge", threshold: 3 },
  { level: "5 referrals", reward: "Connector badge", threshold: 5 },
  { level: "10 referrals", reward: "Ambassador badge", threshold: 10 },
] as const;

export type First72hProgress = {
  profileDone: boolean;
  followDone: boolean;
  badgeDone: boolean;
  inviteDone: boolean;
};

export type First72hFanState = {
  hasProfile: boolean;
  followCount: number;
  badgeCount: number;
  referralCount: number;
  joinedCommunity?: boolean;
  redemptionCount?: number;
  hasPointsMove?: boolean;
};

export function first72hFromFanState(state: First72hFanState): First72hProgress {
  return {
    profileDone: state.hasProfile,
    followDone: state.followCount > 0 || Boolean(state.joinedCommunity),
    badgeDone:
      state.badgeCount > 0 ||
      (state.redemptionCount ?? 0) > 0 ||
      Boolean(state.hasPointsMove),
    inviteDone: state.referralCount > 0,
  };
}

export function first72hStepDone(
  id: First72hStepId,
  progress: First72hProgress,
): boolean {
  if (id === "profile") return progress.profileDone;
  if (id === "follow") return progress.followDone;
  if (id === "badge") return progress.badgeDone;
  return progress.inviteDone;
}

export function first72hAllDone(progress: First72hProgress): boolean {
  return FIRST_72H_STEPS.every((step) => first72hStepDone(step.id, progress));
}

export function shouldShowFirstSessionChecklist(
  progress: First72hProgress,
  dismissed: boolean,
): boolean {
  if (dismissed) return false;
  return !first72hAllDone(progress);
}

export const FIRST_SESSION_DISMISS_KEY = "fanengage_first72h_dismissed";
