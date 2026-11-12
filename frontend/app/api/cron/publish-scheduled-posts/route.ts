import { NextResponse } from "next/server";
import { runCron } from "@/lib/cron-run";
import { cronAuthProblem } from "@/lib/cron-observability";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { isDueForAnnouncement, isMissingScheduledColumnError } from "@/lib/data/scheduled-posts";
import { notifyNewPost } from "@/lib/notifications/triggers/new-post";

/**
 * /api/cron/publish-scheduled-posts — every 5 minutes (frontend/vercel.json).
 *
 * Sprint 4 item A. A post scheduled from the artist-portal composer has
 * `scheduled_for` in the future and is hidden from fans by 0094's RLS plus
 * the app-side filters (lib/data/scheduled-posts.ts). Nothing needs to
 * "publish" it — it becomes visible on its own once scheduled_for <= now().
 * What does need a tick is the follower push: this cron finds scheduled
 * posts that are due and not yet announced, fires notifyNewPost
 * (lib/notifications/triggers/new-post.ts — the same path immediate team
 * posts take at creation) and stamps announced_at so it never fires twice.
 *
 * Posts published immediately have scheduled_for = null and are never
 * selected here; "Publish now" in the portal stamps announced_at itself.
 *
 * ?dryRun=1   list what would be announced, announce nothing, stamp nothing;
 *             cron bearer, or a signed-in super-admin.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Safety cap per tick; the next tick picks up the rest. */
const MAX_PER_RUN = 50;

interface DueRow {
  id: string;
  artist_slug: string;
  author_id: string;
  kind: string;
  scheduled_for: string | null;
  announced_at: string | null;
  moderation_status: string | null;
}

interface RunSummary {
  due: number;
  announced: number;
  skippedHidden: number;
  sample: Array<{ id: string; artist_slug: string; kind: string; scheduled_for: string | null }>;
  errors: string[];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("dryRun") === "1") {
    const authProblem = cronAuthProblem(request);
    if (authProblem) {
      const ctx = await getAdminContext();
      if (!ctx?.isSuperAdmin) {
        return NextResponse.json(
          { ok: false, error: authProblem.error },
          { status: authProblem.status },
        );
      }
    }
    return publishScheduledPosts(true);
  }
  return runCron(request, "publish-scheduled-posts", () => publishScheduledPosts(false));
}

async function publishScheduledPosts(dryRun: boolean) {
  const admin = createAdminClient();
  const now = new Date();
  const summary: RunSummary = { due: 0, announced: 0, skippedHidden: 0, sample: [], errors: [] };

  const { data, error } = await admin
    .from("community_posts")
    .select("id, artist_slug, author_id, kind, scheduled_for, announced_at, moderation_status")
    .not("scheduled_for", "is", null)
    .lte("scheduled_for", now.toISOString())
    .is("announced_at", null)
    .order("scheduled_for", { ascending: true })
    .limit(MAX_PER_RUN);
  if (error) {
    // 0094 not applied yet: nothing can be scheduled, so there is nothing to
    // announce. Say so and stay green rather than writing a cron_runs error
    // row every five minutes until the migration lands.
    if (isMissingScheduledColumnError(error)) {
      console.warn("[publish-scheduled-posts] 0094 not applied: community_posts.scheduled_for missing");
      return NextResponse.json({
        ok: true,
        dryRun,
        summary,
        warning: "0094_scheduled_posts.sql not applied — community_posts.scheduled_for missing",
        ranAt: now.toISOString(),
      });
    }
    return NextResponse.json(
      { ok: false, error: `community_posts select failed: ${error.message}` },
      { status: 500 },
    );
  }

  // Defensive re-check in app code (same predicate the test pins down).
  const due = ((data ?? []) as DueRow[]).filter((p) => isDueForAnnouncement(p, now));
  summary.due = due.length;
  summary.sample = due.slice(0, 10).map((p) => ({
    id: p.id,
    artist_slug: p.artist_slug,
    kind: p.kind,
    scheduled_for: p.scheduled_for,
  }));

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, summary, ranAt: now.toISOString() });
  }

  for (const post of due) {
    try {
      // Claim BEFORE notifying: stamp announced_at only where it is still
      // null and require the row back. If the stamp fails or another tick
      // already claimed it, nothing is pushed — a push to up to 200
      // followers must never be retried every five minutes.
      const { data: claimed, error: stampErr } = await admin
        .from("community_posts")
        .update({ announced_at: new Date().toISOString() })
        .eq("id", post.id)
        .is("announced_at", null)
        .select("id")
        .maybeSingle();
      if (stampErr) throw new Error(`announced_at claim failed: ${stampErr.message}`);
      if (!claimed) continue; // another tick got it first

      // A post moderation hid in the meantime must not be pushed to
      // followers; the claim above still stops it being retried.
      if (post.moderation_status === "auto_hide") {
        summary.skippedHidden += 1;
        continue;
      }
      await notifyNewPost({ postId: post.id, artistSlug: post.artist_slug, authorId: post.author_id });
      summary.announced += 1;
    } catch (err) {
      summary.errors.push(`${post.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({ ok: true, dryRun: false, summary, ranAt: now.toISOString() });
}
