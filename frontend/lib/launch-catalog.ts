/**
 * RaeLynn launch catalog + activity-point constants.
 *
 * Launch SKUs are the only rewards that may appear in marketplace / redeem
 * UI. Everything else stays in the table (history / admin) but is unpublished
 * (`active = false`). Do not expand this set without a Dash decision.
 */

export const LAUNCH_COMMUNITY_ID = "raelynn";

export const ACTIVITY_POINTS = {
  comment: 10,
  commentDailyCap: 5,
  poll: 10,
  pollDailyCap: 3,
  share: 15,
  shareDailyCap: 3,
} as const;

export const REFERRAL_JOIN_POINTS = {
  referrer: 150,
  friend: 50,
} as const;

export const FOUNDING_FAN_CAP = 100;

/** Exact launch titles after the 0051 rename/upsert. */
export const LAUNCH_REWARD_TITLES = [
  "Phone Wallpaper",
  "Lyric Wallpaper",
  "Behind-the-Song Video",
  "Fan Spotlight",
  "VIP Moment Raffle",
] as const;

export type LaunchRewardTitle = (typeof LAUNCH_REWARD_TITLES)[number];

/** Live unscoped reserve set (Data) plus the original hide list. */
export const RESERVED_REWARD_TITLES = [
  "Presale Password Unlock",
  "Early Access Presale Window",
  "Front-of-Line Queue Position",
  "VIP Ticket Upgrade",
  "Soundcheck Access",
  "Meet & Greet Pass",
  "Backstage Tour",
  "Merch Bundle with Ticket",
  "Priority Seating Upgrade",
  "Parking / Rideshare Credit",
  "Behind-the-Scenes Video",
  "Unreleased Demo Unlock",
  "Digital Autograph",
  "Exclusive Acoustic Session Stream",
  "Signed Physical Merch",
  "Personalized Shoutout Video",
  "Birthday Shoutout",
  "Early Album Access",
  "Personal Voice Note",
  "Merch Discount Code",
  "Video Shoutout",
  "Limited Edition Tour Tee",
] as const;

const RESERVED_TITLE_NEEDLES = [
  "merch",
  "voice note",
  "shoutout",
  "presale",
  "meet & greet",
  "meet and greet",
  "tour tee",
  "soundcheck",
  "backstage",
  "vip ticket",
  "vip livestream",
  "bourbon and cigar",
  "nellie",
] as const;

export type CatalogRewardLike = {
  title: string;
  community_id?: string | null;
  active?: boolean;
  clip_url?: string | null;
  in_app_only?: boolean;
};

export function normalizeRewardTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

/** Legacy 0046 title — treat as the Phone Wallpaper launch SKU. */
export function canonicalLaunchTitle(title: string): string | null {
  const normalized = normalizeRewardTitle(title);
  if (normalized === "Exclusive Phone Wallpaper Pack") return "Phone Wallpaper";
  if ((LAUNCH_REWARD_TITLES as readonly string[]).includes(normalized)) {
    return normalized;
  }
  return null;
}

export function isReservedRewardTitle(title: string): boolean {
  const normalized = normalizeRewardTitle(title).toLowerCase();
  if (canonicalLaunchTitle(title)) return false;
  if (
    (RESERVED_REWARD_TITLES as readonly string[]).some(
      (t) => t.toLowerCase() === normalized,
    )
  ) {
    return true;
  }
  return RESERVED_TITLE_NEEDLES.some((needle) => normalized.includes(needle));
}

export function isLaunchRewardRow(row: CatalogRewardLike): boolean {
  if (row.community_id && row.community_id !== LAUNCH_COMMUNITY_ID) {
    return false;
  }
  return canonicalLaunchTitle(row.title) !== null;
}

/**
 * Guest + signed-in marketplace/redeem listing rule.
 * Behind-the-Song requires a real clip. Fan Spotlight stays in-app
 * (signed-in redeem), never a public/web-only tile.
 */
export function shouldListLaunchReward(
  row: CatalogRewardLike,
  opts: { signedIn: boolean },
): boolean {
  if (row.active === false) return false;
  if (!isLaunchRewardRow(row)) return false;

  const title = canonicalLaunchTitle(row.title);
  if (title === "Behind-the-Song Video") {
    const clip = row.clip_url?.trim() ?? "";
    if (!clip) return false;
  }
  if (title === "Fan Spotlight" && !opts.signedIn) return false;
  if (!opts.signedIn) return false;
  return true;
}

export function isInAppOnlyLaunchReward(title: string): boolean {
  return canonicalLaunchTitle(title) === "Fan Spotlight";
}

export function isMisplacedNelliesOffer(title: string): boolean {
  const n = title.toLowerCase();
  return n.includes("bourbon and cigar") || (n.includes("nellie") && n.includes("cigar"));
}

/** Guest preview must not advertise reserved SKUs. */
export const GUEST_FORBIDDEN_PHRASES = [
  "exclusive merch",
  "vip livestream",
  "store credit",
  "$5/mo",
  "signed vinyl",
  "merch prizes",
  "soundcheck",
  "presale",
  "meet & greet",
  "meet-and-greet",
  "early ticket",
  "early ticket access",
  "tour tickets",
  "vinyl",
  "signed merch",
  "pre-sale",
  "vip parties",
  "$5/mo store credit",
] as const;
