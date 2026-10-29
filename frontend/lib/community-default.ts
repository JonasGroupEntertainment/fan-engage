/**
 * Default community slug — the ONE place the launch/fallback community is
 * named in code.
 *
 * Fan Engage Pro is multi-artist. Nothing should assume a particular artist;
 * the viewer's community is resolved from (in order) the route's `[slug]`,
 * the fan's own membership, or the hostname (`resolveCommunityFromHost`).
 * Only when none of those apply do we fall back to this slug, which is the
 * launch community (RaeLynn) unless overridden by env.
 *
 * Env override:
 *   NEXT_PUBLIC_DEFAULT_COMMUNITY_SLUG — read on server and client (inlined
 *                                        into the client bundle at build).
 *   DEFAULT_COMMUNITY_SLUG             — server-only alias.
 *
 * This module is dependency-free on purpose: `lib/community.ts` pulls in
 * `next/headers` and the Supabase admin client, which pure helpers (and the
 * node --test suite) cannot import. `lib/community.ts` re-exports this.
 */

const LAUNCH_FALLBACK_SLUG = "raelynn";
const SLUG_RE = /^[a-z0-9-]{1,64}$/;

/** Validate an env-supplied slug; anything malformed falls back. */
export function resolveDefaultCommunitySlug(
  env: { NEXT_PUBLIC_DEFAULT_COMMUNITY_SLUG?: string; DEFAULT_COMMUNITY_SLUG?: string } = {
    // Literal `process.env.NEXT_PUBLIC_*` reads are what Next inlines for
    // client bundles — keep them spelled out.
    NEXT_PUBLIC_DEFAULT_COMMUNITY_SLUG: process.env.NEXT_PUBLIC_DEFAULT_COMMUNITY_SLUG,
    DEFAULT_COMMUNITY_SLUG: process.env.DEFAULT_COMMUNITY_SLUG,
  },
): string {
  const raw = (env.NEXT_PUBLIC_DEFAULT_COMMUNITY_SLUG ?? env.DEFAULT_COMMUNITY_SLUG ?? "")
    .trim()
    .toLowerCase();
  return SLUG_RE.test(raw) ? raw : LAUNCH_FALLBACK_SLUG;
}

/** The configured fallback community slug. Prefer a resolved community
 *  (route slug, fan membership, host) and use this only as the last resort. */
export const DEFAULT_COMMUNITY_SLUG: string = resolveDefaultCommunitySlug();

/** `/artists/<slug>` plus an optional sub-path (`community`, `rewards`, …). */
export function communityPath(slug: string, sub?: "community" | "rewards" | "events"): string {
  const base = `/artists/${encodeURIComponent(slug)}`;
  return sub ? `${base}/${sub}` : base;
}

/** `/signup?ref=<slug>[&next=...]` — the guest join door for a community. */
export function communitySignupHref(slug: string, next?: string | null): string {
  const params = new URLSearchParams({ ref: slug });
  if (next) params.set("next", next);
  return `/signup?${params.toString()}`;
}

/**
 * Choose the viewer's community on a surface with no `[slug]` route param:
 * the hostname community when the viewer belongs to it, else their first
 * membership (callers pass them earliest-joined first), else the hostname
 * community, else DEFAULT_COMMUNITY_SLUG.
 */
export function pickViewerCommunity(opts: {
  memberSlugs: readonly string[];
  hostSlug: string | null | undefined;
}): string {
  const host = (opts.hostSlug ?? "").trim();
  if (host && opts.memberSlugs.includes(host)) return host;
  if (opts.memberSlugs.length > 0) return opts.memberSlugs[0];
  return host || DEFAULT_COMMUNITY_SLUG;
}
