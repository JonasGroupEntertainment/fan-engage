/**
 * Founder-only content gating — pure helpers (unit-tested, no Next imports).
 *
 * The feed reads community_posts through the viewer's own RLS session.
 * 0091 hid founder-only rows; 0096 also hides premium rows, and hides
 * comments, poll options, and challenge entries on a post the viewer
 * cannot read. Locked cards are title-only stubs from
 * locked_community_post_stubs (never the body). These helpers decide
 * (a) whether a viewer may read a body, (b) where stubs sit in the feed,
 * and (c) whether a viewer may author a given visibility.
 */

export type PostVisibility = "public" | "premium" | "founder-only";

export interface FounderStub {
  id: string;
  title: string | null;
  kind: string;
  pinned: boolean;
  created_at: string;
  /** Omitted stubs stay founder-only, which is what the first caller stored. */
  visibility?: PostVisibility;
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
    visibility:
      stub.visibility === "premium" || stub.visibility === "founder-only"
        ? stub.visibility
        : "founder-only",
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

/**
 * Can this viewer read the body of a post with this visibility?
 *
 * Tier model (same matrix as canAccess in lib/entitlements-core.ts):
 * public is open; premium needs premium / comped / past_due; founder-only
 * needs is_founder. A Founding Fan who is not Premium does not inherit
 * premium posts, and Premium does not inherit founder-only posts.
 * Admins and staff pass isAdmin (admin_users, including '*').
 */
export function canReadPostBody(
  visibility: PostVisibility,
  viewer: { isAdmin: boolean; isFounder: boolean; isPremium: boolean } | null,
): boolean {
  if (visibility === "public") return true;
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  if (visibility === "founder-only") return viewer.isFounder;
  if (visibility === "premium") return viewer.isPremium;
  return false;
}

export interface PostViewer {
  isAdmin: boolean;
  isFounder: boolean;
  isPremium: boolean;
  /** The post's author can read their own gated post. */
  fanId?: string | null;
}

/** Tier check plus the author exception. Public posts are open to everyone. */
export function canReadPost(
  post: { visibility: PostVisibility | null | undefined; author_id?: string | null },
  viewer: PostViewer | null,
): boolean {
  const visibility = post.visibility ?? "public";
  if (visibility === "public") return true;
  if (viewer?.fanId && post.author_id && viewer.fanId === post.author_id) return true;
  if (visibility !== "premium" && visibility !== "founder-only") return false;
  return canReadPostBody(visibility, viewer);
}

/**
 * Per-community form of canReadPost. staffCommunities uses artist slugs;
 * '*' is a super-admin grant (admin_users.community_id).
 */
export function canReadPostInCommunity(
  post: {
    visibility: PostVisibility | null | undefined;
    author_id?: string | null;
    artist_slug: string;
  },
  viewer: {
    fanId?: string | null;
    premiumCommunities: readonly string[];
    founderCommunities: readonly string[];
    staffCommunities?: readonly string[];
  } | null,
): boolean {
  if (!viewer) return canReadPost(post, null);
  const staff = (viewer.staffCommunities ?? []).some(
    (slug) => slug === "*" || slug === post.artist_slug,
  );
  return canReadPost(post, {
    isAdmin: staff,
    isFounder: viewer.founderCommunities.includes(post.artist_slug),
    isPremium: viewer.premiumCommunities.includes(post.artist_slug),
    fanId: viewer.fanId,
  });
}

/** Line used when the body must not be shown. */
export function gatedPostTeaser(visibility: PostVisibility | null | undefined): string {
  if (visibility === "founder-only") return "Founders-only post";
  if (visibility === "premium") return "Premium post";
  return "";
}

/**
 * Copy a post for a fan-facing payload. When the viewer cannot read it,
 * body, media, and the thread summary are cleared. The title stays so the
 * locked card can name the post.
 */
export function redactGatedPost<T extends {
  visibility: PostVisibility | null | undefined;
  body: string;
  author_id?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  video_poster_url?: string | null;
  image_alt?: string | null;
  thread_summary?: string | null;
}>(post: T, viewer: PostViewer | null): T {
  if (canReadPost(post, viewer)) return post;
  const cleared: T = { ...post, body: "" };
  if ("image_url" in post) cleared.image_url = null;
  if ("video_url" in post) cleared.video_url = null;
  if ("video_poster_url" in post) cleared.video_poster_url = null;
  if ("image_alt" in post) cleared.image_alt = null;
  if ("thread_summary" in post) cleared.thread_summary = null;
  return cleared;
}

/** Copy for the locked card. */
export const FOUNDER_LOCKED_COPY = {
  headline: "Founding Fans only",
  cta: "See who's in",
} as const;
