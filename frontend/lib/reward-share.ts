/**
 * The public share page for one reward: /share/reward/<artist>/<reward id>.
 *
 * Rewards in this app are listed for signed-in fans only
 * (lib/launch-catalog.ts shouldListLaunchReward). This page is the one
 * exception, decided by Kevin on 2026-11-22: the two wallpaper rewards may
 * be shown to anyone, so a fan can share them. Nothing else may. Fan
 * Spotlight in particular stays in the app. Do not add a title to
 * PUBLIC_SHARE_REWARD_TITLES without a decision.
 *
 * The page names no fan, and it never shows a reward a fan could not
 * redeem: the reward has to be active, belong to the artist in the
 * address, be on the launch list of redeemable rewards, be open to every
 * fan (no tier-only rewards), be in stock, already dropped and not ended.
 * When a reward cannot be shown, the fan's share falls back to the
 * artist's own page.
 *
 * Pure rules, no browser or server imports, so `node --test` can load this.
 */
import { canonicalLaunchTitle, isLaunchRewardRow } from "./launch-catalog.ts";
import { isDigitallyRedeemableTitle } from "./points/economy.ts";
import { formatPtsShort } from "./tier-thresholds.ts";

/** The only rewards that may be shown on the public share page. */
export const PUBLIC_SHARE_REWARD_TITLES = ["Phone Wallpaper", "Lyric Wallpaper"] as const;

/** rewards_catalog.id is a uuid. */
const REWARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Same shape as artists.slug (lib/onboarding/artist-param.ts). */
const ARTIST_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** The columns of rewards_catalog the share rules read. */
export type ShareableRewardFields = {
  id: string;
  community_id: string | null;
  title: string;
  active: boolean;
  requires_tier?: string | null;
  stock?: number | null;
  drops_at?: string | null;
  expires_at?: string | null;
  clip_url?: string | null;
  in_app_only?: boolean;
};

export function isRewardId(value: string | null | undefined): value is string {
  return typeof value === "string" && REWARD_ID.test(value);
}

function timeOf(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const time = Date.parse(isoDate);
  return Number.isFinite(time) ? time : null;
}

/** May this reward be shown on the public share page for this artist? */
export function isRewardShareable(
  reward: ShareableRewardFields | null | undefined,
  input: { artistSlug: string; now: Date },
): boolean {
  if (!reward) return false;
  if (!ARTIST_SLUG.test(input.artistSlug) || !isRewardId(reward.id)) return false;
  if (reward.active !== true) return false;
  // Another artist's reward, or one with no artist, never shows here.
  if (reward.community_id !== input.artistSlug) return false;
  const title = canonicalLaunchTitle(reward.title);
  if (!title || !(PUBLIC_SHARE_REWARD_TITLES as readonly string[]).includes(title)) return false;
  // On the launch list, and one the database will actually redeem.
  if (!isLaunchRewardRow(reward)) return false;
  if (!isDigitallyRedeemableTitle(reward.title, { active: reward.active, clipUrl: reward.clip_url })) {
    return false;
  }
  // A reward marked to stay inside the app is never public.
  if (reward.in_app_only === true) return false;
  // Tier-only rewards are not open to every fan.
  if (reward.requires_tier) return false;
  // null stock means unlimited; the database refuses zero or less.
  if (reward.stock !== null && reward.stock !== undefined && reward.stock <= 0) return false;
  const now = input.now.getTime();
  const dropsAt = timeOf(reward.drops_at);
  if (dropsAt !== null && dropsAt > now) return false;
  const expiresAt = timeOf(reward.expires_at);
  if (expiresAt !== null && expiresAt <= now) return false;
  return true;
}

/** Path of the reward's share page. Callers check the parts first. */
export function rewardSharePath(artistSlug: string, rewardId: string): string {
  return `/share/reward/${artistSlug}/${rewardId}`;
}

/**
 * The address a fan shares after redeeming: the reward's own share page
 * when the reward may be shown publicly, the artist's page when it may not.
 */
export function rewardShareAddress(input: {
  /** Site address, such as https://www.fanengagepro.com. */
  appUrl: string;
  artistSlug: string;
  reward: ShareableRewardFields | null | undefined;
  now: Date;
}): string {
  const origin = input.appUrl.replace(/\/+$/, "");
  const artistAddress = `${origin}/artists/${input.artistSlug}`;
  if (!input.reward || !isRewardShareable(input.reward, input)) return artistAddress;
  return `${origin}${rewardSharePath(input.artistSlug, input.reward.id)}`;
}

/**
 * What a fan's share says about a reward, from the rewards page.
 *
 * A message a fan sends goes outside the app, so it names a reward only
 * when that reward may be shown publicly (the two wallpapers). For every
 * other reward, Fan Spotlight included, the wording says "a fan reward"
 * and the link goes to the artist's page.
 */
export type RewardShareMessages = {
  /** The reward's share page when it may be public, else the artist's page. */
  url: string;
  /** Whether these messages name the reward. */
  namesReward: boolean;
  /** After a redemption: title and text of the share. */
  redeemedTitle: string;
  redeemedText: string;
  /** On a reward card, before redeeming: title and text of the share. */
  browseTitle: string;
  browseText: string;
};

export function rewardShareMessages(input: {
  /** Site address, such as https://www.fanengagepro.com. */
  appUrl: string;
  artistSlug: string;
  artistName: string;
  reward: ShareableRewardFields & { point_cost: number };
  now: Date;
}): RewardShareMessages {
  const { reward, artistName } = input;
  const url = rewardShareAddress(input);
  const cost = pointsLabel(reward.point_cost);
  if (!isRewardShareable(reward, input)) {
    return {
      url,
      namesReward: false,
      redeemedTitle: "I just redeemed a fan reward on Fan Engage",
      redeemedText: `Cashed in my points for a fan reward from ${artistName}'s fan experience. ${url}`,
      browseTitle: `${artistName} fan rewards`,
      browseText: `Check out the fan rewards from ${artistName} on Fan Engage.`,
    };
  }
  return {
    url,
    namesReward: true,
    redeemedTitle: `I just redeemed ${reward.title} on Fan Engage`,
    redeemedText: `Cashed in ${cost} for ${reward.title} from ${artistName}'s fan experience. ${url}`,
    browseTitle: reward.title,
    browseText: `Check out this drop on Fan Engage: ${reward.title} for ${cost}.`,
  };
}

/** "500 points", "1 point". */
export function pointsLabel(pointCost: number): string {
  const whole = Number.isFinite(pointCost) ? Math.max(0, Math.round(pointCost)) : 0;
  return `${formatPtsShort(whole)} ${whole === 1 ? "point" : "points"}`;
}

/** Said on the page, since a visitor who joins free cannot redeem yet. */
export const SHARE_PAGE_PREMIUM_NOTE = "Redeeming rewards is part of Premium.";

/** Title and description for the page and its social preview. */
export function rewardShareCopy(input: { rewardTitle: string; artistName: string; pointCost: number }): {
  title: string;
  description: string;
} {
  return {
    title: `${input.rewardTitle} · ${input.artistName}`,
    description: `${input.rewardTitle} is a fan reward from ${input.artistName} for ${pointsLabel(input.pointCost)}. Join free and start earning points.`,
  };
}
