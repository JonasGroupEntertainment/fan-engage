/**
 * Scheduled community posts (0094) — pure helpers shared by the fan-facing
 * service-role reads, the portal "Scheduled" section and the publish cron.
 *
 * RLS (community_posts_public_read) already hides rows whose scheduled_for
 * is in the future from fans reading through their own session. Reads that
 * use the service role on a fan's behalf bypass that policy, so they apply
 * `scheduledPostsVisibleFilter` instead:
 *
 *   lib/data/fan-home.ts            Recent activity
 *   lib/data/fan-profile.ts         public profile "recent posts"
 *   lib/search/query.ts             community_posts hydration
 *   lib/personal-feed/compute.ts    personal feed candidates
 *   app/artists/[slug]/community/founder-gate.ts   locked founder stubs
 *   lib/data/community.ts           getPostsByArtist (belt-and-braces; also RLS)
 *
 * Every one of them retries without the filter when the column is missing
 * (withScheduledFilterFallback / isMissingScheduledColumnError), so a deploy
 * that lands before 0094 is applied degrades to the unfiltered read rather
 * than an empty surface.
 */

/**
 * PostgREST `.or()` expression: published-now rows, or scheduled rows whose
 * time has come. `now` is an ISO string so the filter is deterministic.
 */
export function scheduledPostsVisibleFilter(now: Date = new Date()): string {
  return `scheduled_for.is.null,scheduled_for.lte.${now.toISOString()}`;
}

/**
 * PostgREST's error for a filter on a column that is not there yet (0094
 * not applied). Callers that must not go empty in that window retry
 * without the filter.
 */
export function isMissingScheduledColumnError(err: { message?: string | null; code?: string | null } | null | undefined): boolean {
  if (!err) return false;
  const msg = String(err.message ?? "");
  return /scheduled_for/.test(msg) && /column|does not exist|schema cache/i.test(msg);
}

/**
 * Run a community_posts read with the scheduled filter; if PostgREST
 * reports the column missing (0094 not applied), run it again without.
 * `run(true)` must apply `.or(scheduledPostsVisibleFilter())`, `run(false)`
 * must not. Supabase builders are thenables, so pass them straight through.
 */
export async function withScheduledFilterFallback<
  R extends { error: { message?: string | null; code?: string | null } | null },
>(run: (withScheduledFilter: boolean) => PromiseLike<R>): Promise<R> {
  const first = await run(true);
  if (first.error && isMissingScheduledColumnError(first.error)) return run(false);
  return first;
}

export interface ScheduledPostLike {
  scheduled_for: string | null;
  announced_at?: string | null;
}

/** Is this row visible to fans at `now`? Mirrors the RLS clause. */
export function isScheduledPostVisible(post: ScheduledPostLike, now: Date = new Date()): boolean {
  if (!post.scheduled_for) return true;
  return Date.parse(post.scheduled_for) <= now.getTime();
}

/** Still waiting for its publish moment — the portal lists these under "Scheduled". */
export function isPendingScheduledPost(post: ScheduledPostLike, now: Date = new Date()): boolean {
  return !!post.scheduled_for && Date.parse(post.scheduled_for) > now.getTime();
}

/** Due and not yet announced — what /api/cron/publish-scheduled-posts acts on. */
export function isDueForAnnouncement(post: ScheduledPostLike, now: Date = new Date()): boolean {
  if (!post.scheduled_for) return false;
  if (post.announced_at) return false;
  return Date.parse(post.scheduled_for) <= now.getTime();
}

/** Split a portal post list into live and still-scheduled. */
export function partitionScheduledPosts<T extends ScheduledPostLike>(
  posts: readonly T[],
  now: Date = new Date(),
): { live: T[]; scheduled: T[] } {
  const live: T[] = [];
  const scheduled: T[] = [];
  for (const p of posts) (isPendingScheduledPost(p, now) ? scheduled : live).push(p);
  scheduled.sort((a, b) => Date.parse(a.scheduled_for!) - Date.parse(b.scheduled_for!));
  return { live, scheduled };
}
