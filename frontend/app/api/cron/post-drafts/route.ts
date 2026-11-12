import { runCron } from "@/lib/cron-run";
/**
 * /api/cron/post-drafts (FE)
 *
 * AI #18 cron: nightly survey of active artists. For each artist:
 *  - Skip if a pending draft already exists (don't pile up)
 *  - Skip if their community has had 3+ posts in last 5 days (not quiet)
 *  - Otherwise: gather context → Claude → insert draft
 *
 * Capped at 20 artists per tick to bound cost (~$0.002/day max).
 *
 * Auth: Bearer $CRON_SECRET (Vercel cron sends this automatically).
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateArtistPostDraft,
  type DraftContext,
} from "@/lib/post-drafts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_ARTISTS_PER_TICK = 20;
const QUIET_WINDOW_DAYS = 5;
const QUIET_THRESHOLD_POSTS = 3;

interface ArtistRow {
  slug: string;
  name: string | null;
}

interface RunResult {
  ok: boolean;
  scanned: number;
  generated: number;
  skipped_pending: number;
  skipped_active: number;
  errors: number;
  details: Array<{
    slug: string;
    outcome: "generated" | "pending" | "active" | "no-context" | "error";
    note?: string;
  }>;
}

export async function GET(request: Request) {
  return runCron(request, "post-drafts", () => postDrafts());
}

async function postDrafts() {
  const admin = createAdminClient();

  // Pull active artists, oldest-first so quiet ones get attention
  const { data: artistRows, error: artistsErr } = await admin
    .from("artists")
    .select("slug, name, active, created_at")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(200);

  if (artistsErr) {
    return NextResponse.json(
      { ok: false, error: "artists_query_failed", detail: artistsErr.message },
      { status: 500 },
    );
  }

  const artists = ((artistRows ?? []) as ArtistRow[]).slice(0, 200);

  const result: RunResult = {
    ok: true,
    scanned: 0,
    generated: 0,
    skipped_pending: 0,
    skipped_active: 0,
    errors: 0,
    details: [],
  };

  const cutoffIso = new Date(
    Date.now() - QUIET_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const todayDate = new Date().toISOString().slice(0, 10);

  for (const artist of artists) {
    if (result.generated >= MAX_ARTISTS_PER_TICK) break;
    result.scanned += 1;

    try {
      // Skip if a pending draft already exists for this artist
      const { count: pendingCount } = await admin
        .from("artist_post_drafts")
        .select("id", { count: "exact", head: true })
        .eq("artist_slug", artist.slug)
        .eq("status", "pending");

      if ((pendingCount ?? 0) > 0) {
        result.skipped_pending += 1;
        result.details.push({ slug: artist.slug, outcome: "pending" });
        continue;
      }

      // Skip if community is already active
      const { count: recentPostCount } = await admin
        .from("community_posts")
        .select("id", { count: "exact", head: true })
        .eq("artist_slug", artist.slug)
        .gte("created_at", cutoffIso);

      if ((recentPostCount ?? 0) >= QUIET_THRESHOLD_POSTS) {
        result.skipped_active += 1;
        result.details.push({ slug: artist.slug, outcome: "active" });
        continue;
      }

      // Gather context for the draft
      const [eventsRes, postsRes, commentsRes] = await Promise.all([
        admin
          .from("artist_events")
          .select("title, event_date, detail")
          .eq("artist_slug", artist.slug)
          .gte("event_date", todayDate)
          .order("event_date", { ascending: true })
          .limit(5),
        admin
          .from("community_posts")
          .select("kind, title, body")
          .eq("artist_slug", artist.slug)
          .order("created_at", { ascending: false })
          .limit(5),
        admin
          .from("community_comments")
          .select("body, post_id, community_posts!inner(artist_slug)")
          .eq("community_posts.artist_slug", artist.slug)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const upcoming_events = (eventsRes.data ?? []).map((e) => ({
        title: (e.title as string) ?? "Untitled event",
        event_date: (e.event_date as string | null) ?? null,
        detail: (e.detail as string | null) ?? null,
      }));

      const recent_admin_posts = (postsRes.data ?? []).map((p) => ({
        kind: (p.kind as string) ?? "post",
        title: (p.title as string | null) ?? null,
        body: (p.body as string) ?? "",
      }));

      const recent_fan_comments_sample = (commentsRes.data ?? [])
        .map((c) => ({ body: (c.body as string) ?? "" }))
        .filter((c) => c.body.trim().length > 0)
        .slice(0, 12);

      // If we have nothing concrete, don't bother — model might invent things
      if (
        upcoming_events.length === 0 &&
        recent_admin_posts.length === 0 &&
        recent_fan_comments_sample.length === 0
      ) {
        result.details.push({
          slug: artist.slug,
          outcome: "no-context",
          note: "no events/posts/comments to draft from",
        });
        continue;
      }

      const context: DraftContext = {
        artist_slug: artist.slug,
        artist_name: artist.name,
        upcoming_events,
        recent_admin_posts,
        recent_fan_comments_sample,
      };

      const draft = await generateArtistPostDraft(context);
      if (!draft) {
        result.details.push({
          slug: artist.slug,
          outcome: "no-context",
          note: "model returned no draft",
        });
        continue;
      }

      const { error: insertErr } = await admin.from("artist_post_drafts").insert({
        artist_slug: artist.slug,
        kind: draft.kind,
        suggested_title: draft.title,
        suggested_body: draft.body,
        context_summary: draft.context_summary,
        inputs_json: context,
        generated_by: "ai-cron",
      });

      if (insertErr) throw insertErr;

      result.generated += 1;
      result.details.push({ slug: artist.slug, outcome: "generated" });
    } catch (err) {
      result.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[cron post-drafts] failed for", artist.slug, msg);
      result.details.push({ slug: artist.slug, outcome: "error", note: msg });
    }
  }

  return NextResponse.json(result);
}
