/**
 * When a signed-in fan shares something, the link that goes out is their own
 * invite link, so a friend who joins from it is credited to them. The invite
 * page keeps the context of what was shared: which artist, and which share
 * picture to show in the preview.
 *
 * Pure rules, no browser or server imports, so `node --test` can load this.
 */

import { ARTIST_PARAM } from "./onboarding/artist-param.ts";

/** Query parameter that carries the share page whose picture the invite shows. */
export const CARD_PARAM = "card";

/** fans.referral_code is 6 random bytes in hex (0001_init.sql). */
const INVITE_CODE = /^[a-f0-9]{12}$/;
/** Same shape as artists.slug (lib/onboarding/artist-param.ts). */
const ARTIST_SLUG = "[a-z0-9][a-z0-9-]{0,63}";
/** A badge slug, drop name, event id, rank or founder number. */
const SHARE_ITEM = "[A-Za-z0-9_-]{1,64}";

/**
 * Share pages that have their own preview picture (an opengraph-image file
 * beside the page). A test checks this list against the files on disk.
 */
export const SHARE_KINDS_WITH_PICTURE = ["badge", "drop", "founder", "rank", "rsvp", "tier"] as const;
/** The tier page is /share/tier/<artist>. Every other kind names one item after the artist. */
const SHARE_KIND_WITHOUT_ITEM = "tier";
const SHARE_KINDS_WITH_ITEM = SHARE_KINDS_WITH_PICTURE.filter((kind) => kind !== SHARE_KIND_WITHOUT_ITEM);

/** A share page, such as /share/tier/raelynn or /share/badge/raelynn/founder-fan. */
const SHARE_CARD = new RegExp(
  `^/share/(?:${SHARE_KIND_WITHOUT_ITEM}/(${ARTIST_SLUG})|(?:${SHARE_KINDS_WITH_ITEM.join("|")})/(${ARTIST_SLUG})/${SHARE_ITEM})$`,
);
/** Any share page, with or without a picture: /share/<kind>/<artist>/... */
const SHARE_PAGE_ARTIST = new RegExp(`^/share/[a-z]+/(${ARTIST_SLUG})(?:/|$)`);
const ARTIST_PAGE = new RegExp(`^/artists/(${ARTIST_SLUG})(?:/|$)`);
/** Already an invite link. The artist page builds these on the server. */
const INVITE_PAGE = /^\/invite\//;
/** Only used to read the path of an address that may have no origin. */
const PLACEHOLDER_ORIGIN = "https://placeholder.invalid";

export function isInviteCode(value: string | null | undefined): value is string {
  return typeof value === "string" && INVITE_CODE.test(value);
}

/** A share page path that is safe to use for the preview picture, or null. */
export function safeShareCard(value: string | null | undefined): string | null {
  return typeof value === "string" && SHARE_CARD.test(value) ? value : null;
}

/** The artist slug a share page path belongs to, or null when it is not a share page. */
export function shareCardArtist(card: string): string | null {
  const match = SHARE_CARD.exec(card);
  return match ? (match[1] ?? match[2] ?? null) : null;
}

export type ShareContext = { artist: string | null; card: string | null };

const NO_CONTEXT: ShareContext = { artist: null, card: null };

function pathOf(url: string): string | null {
  try {
    return new URL(url, PLACEHOLDER_ORIGIN).pathname;
  } catch {
    return null;
  }
}

/** Which artist and share page a shared address is about. */
export function shareContextFromUrl(url: string): ShareContext {
  const path = pathOf(url);
  if (path === null) return NO_CONTEXT;
  const card = safeShareCard(path);
  if (card) return { artist: shareCardArtist(card), card };
  const artistPage = ARTIST_PAGE.exec(path) ?? SHARE_PAGE_ARTIST.exec(path);
  return artistPage ? { artist: artistPage[1], card: null } : NO_CONTEXT;
}

/**
 * The fan's invite link for whatever they are sharing. Returns the original
 * address unchanged when there is no usable invite code, or when the address
 * is already an invite link.
 */
export function inviteShareUrl(input: {
  /** Where the invite page lives, such as https://www.fanengagepro.com. */
  origin: string;
  /** The address the share button was given. */
  url: string;
  inviteCode: string | null | undefined;
}): string {
  if (!isInviteCode(input.inviteCode)) return input.url;
  const path = pathOf(input.url);
  if (path !== null && INVITE_PAGE.test(path)) return input.url;
  const { artist, card } = shareContextFromUrl(input.url);
  const params = new URLSearchParams();
  if (artist) params.set(ARTIST_PARAM, artist);
  if (card) params.set(CARD_PARAM, card);
  const query = params.toString();
  const origin = input.origin.replace(/\/+$/, "");
  return `${origin}/invite/${input.inviteCode}${query ? `?${query}` : ""}`;
}

/** A dash that joined the text to the address and now ends the message. */
const HANGING_DASH = /\s+[\u2014\u2013-]+\s*$/;

/** Share text with the old address taken out, so only one link is sent. */
export function shareTextWithoutUrl(text: string, url: string): string {
  if (!url || !text.includes(url)) return text.trim();
  return text
    .split(url)
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .replace(HANGING_DASH, "")
    .trim();
}

/** Where the invite page takes the preview picture from, or null for the default. */
export function invitePreviewImagePath(context: ShareContext): string | null {
  if (context.card) return `${context.card}/opengraph-image`;
  if (context.artist) return `/artists/${context.artist}/opengraph-image`;
  return null;
}
