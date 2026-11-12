/**
 * `?artist=<slug>` on /onboarding (and carried through /invite → /signup →
 * /onboarding) names the artist a new fan should land in. It is independent
 * of `?ref=`, which keeps its existing meaning (the referrer's invite code on
 * /onboarding; the artist-page Join CTA also passes the artist slug there,
 * and that still works).
 *
 * Nothing here trusts the raw value: `parseArtistParam` only shapes it, and
 * the server page must look the slug up in `public.artists` (active = true)
 * before locking the wizard to it. An unknown slug falls back to the old
 * behaviour. `nellies` (Brand Engage Pro) is never an FE artist, so it can
 * never resolve — no special-casing needed or wanted.
 */

export const ARTIST_PARAM = "artist";

/** Same shape as communities.slug / artists.slug — lowercase slug chars only. */
const ARTIST_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Normalize a raw query value to a candidate slug, or null when it is not
 * slug-shaped. Accepts the `string | string[] | undefined` that Next hands a
 * page's `searchParams`; a repeated param takes its first value.
 */
export function parseArtistParam(
  raw: string | string[] | null | undefined,
): string | null {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first !== "string") return null;
  const candidate = first.trim().toLowerCase();
  if (!ARTIST_SLUG_RE.test(candidate)) return null;
  return candidate;
}

export type OnboardArtistSource = "artist" | "ref" | "default";

/**
 * Which community the onboarding payload should join. A validated `?artist=`
 * wins; otherwise `?ref=` keeps meaning what it meant (artist slug from the
 * Join CTA, or a fan invite code that the server will reject and default);
 * otherwise the launch community.
 */
export function resolveOnboardArtist(opts: {
  /** Server-validated artist slug (null when ?artist= was missing or unknown). */
  lockedArtist?: string | null;
  refFromUrl?: string | null;
  defaultSlug: string;
}): { slug: string; source: OnboardArtistSource } {
  const locked = parseArtistParam(opts.lockedArtist);
  if (locked) return { slug: locked, source: "artist" };
  const ref = (opts.refFromUrl ?? "").trim();
  if (ref) return { slug: ref, source: "ref" };
  return { slug: opts.defaultSlug, source: "default" };
}

/**
 * Append `artist=<slug>` to an app path or absolute URL when a slug is known.
 * Leaves the input untouched for a null/invalid slug. Existing `artist`
 * params are replaced so a link is never built with two.
 */
export function withArtistParam(href: string, artistSlug: string | null | undefined): string {
  const slug = parseArtistParam(artistSlug);
  if (!slug) return href;
  const [base, hash = ""] = splitHash(href);
  const qIndex = base.indexOf("?");
  const path = qIndex === -1 ? base : base.slice(0, qIndex);
  const params = new URLSearchParams(qIndex === -1 ? "" : base.slice(qIndex + 1));
  params.set(ARTIST_PARAM, slug);
  return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
}

function splitHash(href: string): [string, string] {
  const i = href.indexOf("#");
  return i === -1 ? [href, ""] : [href.slice(0, i), href.slice(i + 1)];
}

/**
 * Canonical invite link. `/invite/<code>` is the referrer's code; `artist`
 * lands the invitee in that artist's community; `event` deep-links an RSVP.
 */
export function buildInviteLink(opts: {
  origin: string;
  code: string;
  artistSlug?: string | null;
  eventId?: string | null;
}): string {
  const origin = opts.origin.replace(/\/+$/, "");
  const params = new URLSearchParams();
  const slug = parseArtistParam(opts.artistSlug);
  if (slug) params.set(ARTIST_PARAM, slug);
  if (opts.eventId) params.set("event", opts.eventId);
  const query = params.toString();
  return `${origin}/invite/${encodeURIComponent(opts.code)}${query ? `?${query}` : ""}`;
}
