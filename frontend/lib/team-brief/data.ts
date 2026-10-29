import type { SupabaseClient } from "@supabase/supabase-js";
import { pageAll, pageAllIn } from "../supabase/page-all.ts";
import { FAN_NAME_COLUMNS } from "../format/fan-name.ts";
import { TEAM_BRIEF_KIND } from "./constants.ts";
import { engagementCutoffIso, type RawEvent, type RawFan, type RawMembership, type TeamBriefRaw } from "./gather.ts";
import { thankCooldownCutoffIso } from "../superfans/to-thank.ts";

/**
 * Small typed reads behind the Monday team brief. Every list is paged
 * with pageAll (PostgREST caps a select at 1,000 rows and truncates
 * silently) and every `.in()` is chunked. Nothing here decides anything;
 * lib/team-brief/gather.ts does.
 *
 * Tables (all scoped by the artist slug == community slug):
 *   artists                    slug, name, active
 *   communities                slug, display_name
 *   admin_users                user_id, role        (community_id = slug; '*' rows are super-admins, not team)
 *   fans                       id, email, names, is_internal, profile_slug, public_profile_enabled
 *   fan_artist_following       followed_at
 *   community_posts            author_id, created_at   (artist_slug — community_id is
 *                              never set by the app and defaults to 'raelynn' since 0011)
 *   community_comments         author_id, created_at   via community_posts!inner(artist_slug)
 *   community_reactions        fan_id, created_at      via community_posts!inner(artist_slug)
 *   checkins                   fan_id, created_at      (artist_slug)
 *   event_rsvps                fan_id, rsvp_at         via artist_events!inner(artist_slug)
 *   reward_redemptions         fan_id, created_at      (community_id — set by the redeem RPC)
 *   points_ledger              fan_id, delta, created_at (community_id — set by the award RPCs; delta > 0)
 *   artist_events              id, title, event_date, starts_at, ends_at, url (artist_slug, active)
 *   artist_post_drafts         count where status = 'pending'
 *   superfan_thanks (0095)     fan_id, thanked_at — missing table reads as "nobody thanked"
 *   fan_community_memberships  current_tier, total_points
 *   notification_log           team_brief rows for dedup
 */

// The structural check against SupabaseClient recurses too deep for tsc
// on chained builders, so reads go through `any`-typed `from()`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

export type ArtistRow = { slug: string; displayName: string };
export type TeamMember = { userId: string; role: string; email: string | null; name: string };

export type TeamBriefLog = {
  fan_id: string;
  channel: "email";
  notification_type: typeof TEAM_BRIEF_KIND;
  title: string | null;
  body: string | null;
  url: string | null;
  status: "sent" | "failed" | "suppressed";
  suppression_reason: string | null;
  error: string | null;
  metadata: Record<string, unknown>;
  sent_at: string;
};

export type TeamBriefDeps = {
  listActiveArtists(): Promise<ArtistRow[]>;
  listTeam(slug: string): Promise<TeamMember[]>;
  loadRaw(artist: ArtistRow, team: TeamMember[], period: { start: string; end: string }, now: Date): Promise<TeamBriefRaw>;
  /**
   * Community slugs whose real brief already went out this week_start —
   * 'sent' rows only, and never a ?testEmail smoke-test row (those are
   * logged 'suppressed' with metadata.test_email), so Monday's test send
   * does not make the real run skip the artist.
   */
  sentThisWeek(weekStart: string): Promise<Set<string>>;
  insertLogs(rows: TeamBriefLog[]): Promise<{ error: { message: string } | null }>;
};

function fail(label: string, error: { message: string } | null): never {
  throw new Error(`${label}: ${error?.message ?? "unknown error"}`);
}

export function teamBriefDeps(admin: SupabaseClient | Client): TeamBriefDeps {
  const db = admin as Client;
  return {
    async listActiveArtists() {
      const res = await pageAll<{ slug: string; name: string }>(() =>
        db.from("artists").select("slug, name").eq("active", true).order("slug", { ascending: true }),
      );
      if (res.error) fail("artists", res.error);
      const slugs = res.data.map((a) => a.slug);
      const names = new Map(res.data.map((a) => [a.slug, a.name]));
      if (slugs.length > 0) {
        const comm = await pageAllIn<{ slug: string; display_name: string | null }, string>(slugs, (part) =>
          db.from("communities").select("slug, display_name").in("slug", part).order("slug", { ascending: true }),
        );
        if (comm.error) fail("communities", comm.error);
        for (const c of comm.data) if (c.display_name) names.set(c.slug, c.display_name);
      }
      return slugs.map((slug) => ({ slug, displayName: names.get(slug) ?? slug }));
    },

    async listTeam(slug) {
      const res = await pageAll<{ user_id: string; role: string }>(() =>
        db.from("admin_users").select("user_id, role").eq("community_id", slug).order("user_id", { ascending: true }),
      );
      if (res.error) fail("admin_users", res.error);
      const fans = await loadFans(db, res.data.map((r) => r.user_id));
      const byId = new Map(fans.map((f) => [f.id, f]));
      return res.data.map((r) => {
        const f = byId.get(r.user_id);
        const name = [f?.first_name, f?.last_name].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
        return { userId: r.user_id, role: r.role, email: f?.email?.trim() || null, name };
      });
    },

    async loadRaw(artist, team, period, now) {
      const slug = artist.slug;
      const since = engagementCutoffIso(period.end);
      const thankCutoff = thankCooldownCutoffIso(now);
      const stamp = (rows: Array<Record<string, unknown>>, col = "created_at") =>
        rows.map((r) => ({ fan_id: String(r.fan_id ?? ""), at: (r[col] as string | null) ?? null }));
      const posted = (rows: Array<Record<string, unknown>>) =>
        rows.map((r) => ({ author_id: String(r.author_id ?? ""), at: (r.created_at as string | null) ?? null }));

      const [follows, posts, comments, reactions, checkins, rsvps, redemptions, ledger, events, drafts, thanks] =
        await Promise.all([
          pageAll<Record<string, unknown>>(() =>
            db.from("fan_artist_following").select("fan_id, followed_at").eq("artist_slug", slug)
              .gte("followed_at", period.start).order("followed_at", { ascending: true }),
          ),
          pageAll<Record<string, unknown>>(() =>
            db.from("community_posts").select("author_id, created_at").eq("artist_slug", slug)
              .gte("created_at", period.start).order("created_at", { ascending: true }),
          ),
          pageAll<Record<string, unknown>>(() =>
            db.from("community_comments").select("author_id, created_at, community_posts!inner(artist_slug)")
              .eq("community_posts.artist_slug", slug).gte("created_at", since).order("created_at", { ascending: true }),
          ),
          pageAll<Record<string, unknown>>(() =>
            db.from("community_reactions").select("fan_id, created_at, community_posts!inner(artist_slug)")
              .eq("community_posts.artist_slug", slug).gte("created_at", since).order("created_at", { ascending: true }),
          ),
          pageAll<Record<string, unknown>>(() =>
            db.from("checkins").select("fan_id, created_at").eq("artist_slug", slug)
              .gte("created_at", since).order("created_at", { ascending: true }),
          ),
          pageAll<Record<string, unknown>>(() =>
            db.from("event_rsvps").select("fan_id, rsvp_at, artist_events!inner(artist_slug)")
              .eq("artist_events.artist_slug", slug).gte("rsvp_at", since).order("rsvp_at", { ascending: true }),
          ),
          pageAll<Record<string, unknown>>(() =>
            db.from("reward_redemptions").select("fan_id, created_at").eq("community_id", slug)
              .gte("created_at", since).order("created_at", { ascending: true }),
          ),
          pageAll<Record<string, unknown>>(() =>
            db.from("points_ledger").select("fan_id, delta, created_at").eq("community_id", slug)
              .gt("delta", 0).gte("created_at", since).order("created_at", { ascending: true }),
          ),
          pageAll<RawEvent>(() =>
            db.from("artist_events").select("id, title, event_date, starts_at, ends_at, url")
              .eq("artist_slug", slug).eq("active", true).order("created_at", { ascending: true }),
          ),
          db.from("artist_post_drafts").select("id", { count: "exact", head: true })
            .eq("artist_slug", slug).eq("status", "pending") as PromiseLike<{ count: number | null; error: { message: string } | null }>,
          pageAll<Record<string, unknown>>(() =>
            db.from("superfan_thanks").select("fan_id, thanked_at").eq("community_id", slug)
              .gte("thanked_at", thankCutoff).order("thanked_at", { ascending: true }),
          ),
        ]);

      for (const [label, res] of [
        ["fan_artist_following", follows],
        ["community_posts", posts],
        ["community_comments", comments],
        ["community_reactions", reactions],
        ["checkins", checkins],
        ["event_rsvps", rsvps],
        ["reward_redemptions", redemptions],
        ["points_ledger", ledger],
        ["artist_events", events],
      ] as const) {
        if (res.error) fail(label, res.error);
      }
      if (drafts.error) fail("artist_post_drafts", drafts.error);
      // superfan_thanks arrives with 0095; until it is applied nobody has
      // been thanked, which is the truth.
      let thankRows: Array<{ fan_id: string; thanked_at: string | null }> = [];
      if (thanks.error) {
        console.warn("[team-brief] superfan_thanks unavailable (0095 applied?):", thanks.error.message);
      } else {
        thankRows = thanks.data.map((r) => ({ fan_id: String(r.fan_id ?? ""), thanked_at: (r.thanked_at as string | null) ?? null }));
      }

      const fanIds = new Set<string>();
      for (const r of comments.data ?? []) fanIds.add(String(r.author_id ?? ""));
      for (const r of ledger.data ?? []) fanIds.add(String(r.fan_id ?? ""));
      for (const rows of [reactions.data, checkins.data, rsvps.data, redemptions.data]) {
        for (const r of rows ?? []) fanIds.add(String(r.fan_id ?? ""));
      }
      for (const t of team) fanIds.add(t.userId);
      fanIds.delete("");
      const ids = Array.from(fanIds);
      const [fans, memberships] = await Promise.all([loadFans(db, ids), loadMemberships(db, slug, ids)]);

      return {
        community: { slug, displayName: artist.displayName },
        period,
        team: team.map((t) => ({ user_id: t.userId, role: t.role })),
        follows: stamp(follows.data ?? [], "followed_at"),
        posts: posted(posts.data ?? []),
        comments: posted(comments.data ?? []),
        reactions: stamp(reactions.data ?? []),
        checkins: stamp(checkins.data ?? []),
        rsvps: stamp(rsvps.data ?? [], "rsvp_at"),
        redemptions: stamp(redemptions.data ?? []),
        ledger: (ledger.data ?? []).map((r) => ({
          fan_id: String(r.fan_id ?? ""),
          delta: Number(r.delta ?? 0),
          at: (r.created_at as string | null) ?? null,
        })),
        events: events.data ?? [],
        pendingDrafts: drafts.count ?? 0,
        thanks: thankRows,
        fans,
        memberships,
      };
    },

    async sentThisWeek(weekStart) {
      const res = await pageAll<{ status: string; metadata: Record<string, unknown> | null }>(() =>
        db.from("notification_log").select("status, metadata").eq("notification_type", TEAM_BRIEF_KIND).eq("status", "sent")
          .gte("sent_at", `${weekStart}T00:00:00.000Z`).order("sent_at", { ascending: true }),
      );
      if (res.error) fail("notification_log", res.error);
      return sentCommunitiesFromLogs(res.data, weekStart);
    },

    async insertLogs(rows) {
      if (rows.length === 0) return { error: null };
      const { error } = await db.from("notification_log").insert(rows);
      return { error: error ? { message: String(error.message) } : null };
    },
  };
}

async function loadFans(db: Client, ids: string[]): Promise<RawFan[]> {
  if (ids.length === 0) return [];
  const res = await pageAllIn<Record<string, unknown>, string>(ids, (part) =>
    db.from("fans").select(`id, email, ${FAN_NAME_COLUMNS}, is_internal, profile_slug, public_profile_enabled`)
      .in("id", part).order("id", { ascending: true }),
  );
  if (res.error) fail("fans", res.error);
  return res.data.map((f) => ({
    id: String(f.id),
    email: (f.email as string | null) ?? null,
    first_name: (f.first_name as string | null) ?? null,
    last_name: (f.last_name as string | null) ?? null,
    is_internal: f.is_internal === true,
    profile_slug: (f.profile_slug as string | null) ?? null,
    public_profile_enabled: f.public_profile_enabled !== false,
  }));
}

async function loadMemberships(db: Client, slug: string, ids: string[]): Promise<RawMembership[]> {
  if (ids.length === 0) return [];
  const res = await pageAllIn<RawMembership, string>(ids, (part) =>
    db.from("fan_community_memberships").select("fan_id, current_tier, total_points")
      .eq("community_id", slug).in("fan_id", part).order("fan_id", { ascending: true }),
  );
  if (res.error) fail("fan_community_memberships", res.error);
  return res.data;
}

/**
 * Pure: which communities a set of team_brief notification_log rows mark
 * as done for `weekStart`. A ?testEmail run writes 'suppressed' rows with
 * metadata.test_email; only clean 'sent' rows count.
 */
export function sentCommunitiesFromLogs(
  rows: ReadonlyArray<{ status?: string | null; metadata: Record<string, unknown> | null }>,
  weekStart: string,
): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (r.status != null && r.status !== "sent") continue;
    const m = r.metadata ?? {};
    if (m.test_email) continue;
    if (m.week_start === weekStart && typeof m.community_id === "string") out.add(m.community_id);
  }
  return out;
}
