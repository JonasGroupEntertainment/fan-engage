/**
 * Founder-only content gating — pure helpers (unit-tested, no Next imports).
 *
 * The feed reads community_posts through the viewer's own RLS session. 0091
 * hides founder-only rows from non-founders at the DB, so the page fetches
 * body-less stubs with the service role and merges them back in as locked
 * cards. These helpers decide (a) which stubs to fetch and (b) where they
 * sit in the feed, and (c) whether a viewer may author a given visibility.
 */

export type PostVisibility = "public" | "premium" | "founder-only";

export interface FounderStub {
  id: string;
  title: string | null;
  kind: string;
  pinned: boolean;
  created_at: string;
}

export interface FeedPostLike {
  id: string;
  pinned: boolean;
  created_at: string;
  visibility: PostVisibility;
}

/** A stub becomes a feed row with an empty body and visibility 'founder-only'. */
export function stubToLockedPost<T extends FeedPostLike>(
  stub: FounderStub,
  template: Omit<T, "id" | "pinned" | "created_at" | "visibility" | "title" | "body" | "kind">,
): T {
  return {
    ...(template as object),
    id: stub.id,
    kind: stub.kind,
    title: stub.title,
    body: "",
    pinned: stub.pinned,
    created_at: stub.created_at,
    visibility: "founder-only",
  } as unknown as T;
}

/**
 * Merge locked stubs into the visible feed, keeping the feed's own order
 * rule (pinned first, then newest). Any stub whose id is already in the
 * feed (viewer could read it) is dropped so nothing renders twice.
 */
export function mergeFounderStubs<T extends FeedPostLike>(
  visible: readonly T[],
  stubs: readonly T[],
): T[] {
  const seen = new Set(visible.map((p) => p.id));
  const extra = stubs.filter((s) => !seen.has(s.id));
  if (extra.length === 0) return [...visible];
  return [...visible, ...extra].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

/**
 * Who may author which visibility. Team authors (an admin_users grant for the
 * community or '*' — the same rule as lib/data/community.ts
 * getTeamAuthoredPostIds / lib/notifications/triggers/new-post.ts
 * isTeamAuthored) may post premium or founder-only; fans always post public.
 */
export function resolveAuthorVisibility(
  requested: string | null | undefined,
  author: { hasTeamGrant: boolean },
): PostVisibility {
  const v = String(requested ?? "public").toLowerCase().trim();
  if (!author.hasTeamGrant) return "public";
  if (v === "premium" || v === "founder-only") return v;
  return "public";
}

/** Can this viewer read the body of a post with this visibility? */
export function canReadPostBody(
  visibility: PostVisibility,
  viewer: { isAdmin: boolean; isFounder: boolean; isPremium: boolean } | null,
): boolean {
  if (visibility === "public") return true;
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  if (visibility === "founder-only") return viewer.isFounder;
  return viewer.isPremium;
}

/** Copy for the locked card. */
export const FOUNDER_LOCKED_COPY = {
  headline: "Founding Fans only",
  cta: "See who's in",
} as const;
