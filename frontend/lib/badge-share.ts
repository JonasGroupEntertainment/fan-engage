/**
 * Sharing an earned badge, from the fan's profile and from the badge
 * gallery on the Rewards page.
 *
 * The Share button sends the badge's public share page
 * (/share/badge/<artist>/<badge>, which has its own picture). The Share
 * button turns that address into the signed-in fan's invite link, so a
 * friend who joins from it is credited to them (lib/invite-share.ts).
 *
 * The message names the badge and nothing else:
 *   - no fan. The profile is public and does not know who is looking at
 *     it, and a fan can be as young as 13, so a share message never puts
 *     a fan's name next to an achievement.
 *   - no artist. Which artist a badge was earned for is not reliable in
 *     the data (fan_badges.community_id has a default), so the wording
 *     does not claim one.
 *
 * Pure rules, no browser or server imports, so `node --test` can load this.
 */

/** Same shape as artists.slug (lib/onboarding/artist-param.ts). */
const ARTIST_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** A badge slug that is safe to put in a share page address. */
const BADGE_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/**
 * The artist whose share page a badge is shared under: the artist the
 * badge is recorded against when that artist is live and the fan follows
 * them, else the first live artist the fan follows. Only live artists are
 * used, because an artist who is not live has no public pages. Null when
 * the fan follows no live artist, and then there is no Share button.
 */
export function badgeShareArtist(
  communityId: string | null | undefined,
  liveFollowedArtistSlugs: readonly string[],
): string | null {
  const usable = liveFollowedArtistSlugs.filter((slug) => ARTIST_SLUG.test(slug));
  return usable.find((slug) => slug === communityId) ?? usable[0] ?? null;
}

export type BadgeShare = { url: string; title: string; text: string };

/**
 * What the Share button under an earned badge sends, or null when the
 * badge or artist could not be put in an address safely.
 */
export function badgeShare(input: {
  badge: { slug: string; name: string };
  artistSlug: string | null | undefined;
  /** Site address, such as https://www.fanengagepro.com. */
  appUrl: string;
}): BadgeShare | null {
  const { badge, artistSlug } = input;
  if (!artistSlug || !ARTIST_SLUG.test(artistSlug) || !BADGE_SLUG.test(badge.slug)) return null;
  const badgeName = badge.name.trim();
  if (!badgeName) return null;
  const origin = input.appUrl.replace(/\/+$/, "");
  const url = `${origin}/share/badge/${artistSlug}/${badge.slug}`;
  return {
    url,
    title: `${badgeName} badge on Fan Engage`,
    text: `The ${badgeName} badge, earned on Fan Engage. ${url}`,
  };
}
