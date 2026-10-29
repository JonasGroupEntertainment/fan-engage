import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalContext } from "@/lib/artist-portal/access";

export const dynamic = "force-dynamic";

async function getPortalData(communityId: string) {
  const admin = createAdminClient();

  const [
    { count: subscriberCount },
    { data: topFans },
    { data: recentPosts },
    { data: nextEvents },
  ] = await Promise.all([
    // Subscriber / follower count
    admin
      .from("fan_community_memberships")
      .select("fan_id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .eq("status", "active"),

    // Top 5 fans by total_points in this community
    admin
      .from("fan_community_memberships")
      // fans!inner + the is_internal filter drops staff/test accounts (0073).
      .select("fan_id, total_points, current_tier, fans!inner(display_name, avatar_url, is_internal)")
      .eq("community_id", communityId)
      .eq("fans.is_internal", false)
      .order("total_points", { ascending: false })
      .limit(5),

    // Recent 3 posts in this community (artist_slug = communityId)
    admin
      .from("community_posts")
      .select("id, title, body, created_at, author_id, fans(display_name)")
      .eq("artist_slug", communityId)
      .order("created_at", { ascending: false })
      .limit(3),

    // Next upcoming event
    admin
      .from("artist_events")
      .select("id, title, detail, event_date, location, url")
      .eq("artist_slug", communityId)
      .eq("active", true)
      .order("sort_order")
      .limit(3),
  ]);

  return {
    subscriberCount: subscriberCount ?? 0,
    topFans: topFans ?? [],
    recentPosts: recentPosts ?? [],
    nextEvents: nextEvents ?? [],
  };
}

export default async function ArtistPortalDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/artist-portal");

  // Any admin_users role (owner/admin/editor/viewer) can see the dashboard.
  // getPortalContext resolves one community even when the user holds
  // several grants, so no `.maybeSingle()` ambiguity here.
  const ctx = await getPortalContext();
  if (!ctx) {
    // Signed in but not on any artist team — never redirect back to this
    // same route; explain and point at the application.
    return (
      <div className="rounded-2xl border border-white/10 bg-black/40 p-8 text-center">
        <p className="text-lg font-semibold text-white/80">
          You&apos;re not on an artist team yet
        </p>
        <p className="mt-2 text-sm text-white/50">
          The artist portal is for artists and their teams. If you&apos;re an
          artist, apply to launch your community; if you&apos;re on a team,
          ask the community owner to add you from their Team page.
        </p>
        <Link
          href="/for-artists/apply"
          className="mt-6 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
        >
          Apply as an artist
        </Link>
      </div>
    );
  }

  const admin = createAdminClient();
  const { data: community } = await admin
    .from("communities")
    .select("slug, display_name")
    .eq("slug", ctx.communityId)
    .maybeSingle();

  const { subscriberCount, topFans, recentPosts, nextEvents } =
    await getPortalData(ctx.communityId);

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {community?.display_name ?? "Artist Dashboard"}
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Your fan community at a glance.
        </p>
      </div>

      {/* Stat card */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <p className="text-xs uppercase tracking-wide text-white/50">
            Subscribers
          </p>
          <p className="mt-2 text-4xl font-semibold">{subscriberCount}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <p className="text-xs uppercase tracking-wide text-white/50">
            Posts
          </p>
          <p className="mt-2 text-4xl font-semibold">{recentPosts.length}</p>
          <p className="mt-1 text-xs text-white/50">shown: last 3</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <p className="text-xs uppercase tracking-wide text-white/50">
            Top fans
          </p>
          <p className="mt-2 text-4xl font-semibold">{topFans.length}</p>
        </div>
      </div>

      {/* Two-col: top fans + recent posts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top fans */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/60">
            Top 5 Fans
          </h2>
          {topFans.length === 0 ? (
            <p className="text-sm text-white/50">No fans yet.</p>
          ) : (
            <ol className="space-y-3">
              {topFans.map((f, i) => {
                const fan = (f.fans as unknown) as { display_name: string | null; avatar_url: string | null } | null;
                return (
                  <li key={f.fan_id} className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-xs text-white/50">
                      {i + 1}.
                    </span>
                    <div className="h-8 w-8 shrink-0 rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-xs text-white/50">
                      {fan?.display_name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {fan?.display_name ?? "Anonymous"}
                      </p>
                      <p className="text-xs text-white/50">
                        {f.total_points.toLocaleString()} pts · {f.current_tier}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Recent posts */}
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/60">
            Recent Posts
          </h2>
          {recentPosts.length === 0 ? (
            <p className="text-sm text-white/50">No posts yet.</p>
          ) : (
            <ul className="space-y-4">
              {recentPosts.map((p) => {
                const author = (p.fans as unknown) as { display_name: string | null } | null;
                return (
                  <li key={p.id} className="border-b border-white/5 pb-4 last:border-0 last:pb-0">
                    {p.title && (
                      <p className="text-sm font-semibold text-white">
                        {p.title}
                      </p>
                    )}
                    <p className="mt-0.5 text-sm text-white/70 line-clamp-2">
                      {p.body}
                    </p>
                    <p className="mt-1 text-xs text-white/50">
                      by {author?.display_name ?? "Unknown"} ·{" "}
                      {new Date(p.created_at as string).toLocaleDateString()}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Upcoming events */}
      {nextEvents.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/60">
            Upcoming Events
          </h2>
          <ul className="space-y-3">
            {nextEvents.map((e) => (
              <li key={e.id} className="flex items-start gap-4">
                <div className="shrink-0 rounded-lg bg-white/5 px-3 py-2 text-center">
                  <p className="text-xs text-white/50">
                    {e.event_date
                      ? new Date(e.event_date as string).toLocaleDateString("en-US", {
                          month: "short",
                        })
                      : "TBD"}
                  </p>
                  <p className="text-lg font-bold text-white">
                    {e.event_date
                      ? new Date(e.event_date as string).getDate()
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{e.title}</p>
                  {e.location && (
                    <p className="text-xs text-white/50">{e.location}</p>
                  )}
                  {e.detail && (
                    <p className="mt-0.5 text-xs text-white/50 line-clamp-1">
                      {e.detail}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
