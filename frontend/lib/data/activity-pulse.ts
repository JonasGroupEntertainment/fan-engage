import { createAdminClient } from "@/lib/supabase/admin";

export interface ActivityPulse {
  checkinsToday: number;
  rsvpsThisWeek: number;
  postsThisWeek: number;
  newFollowersThisWeek: number;
}

export async function getActivityPulse(artistSlug: string): Promise<ActivityPulse> {
  const admin = createAdminClient();
  const now = new Date();
  const todayET = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [checkinsRes, rsvpsRes, postsRes, followersRes] = await Promise.allSettled([
    admin
      .from("checkins")
      .select("id", { count: "exact", head: true })
      .eq("artist_slug", artistSlug)
      .gte("created_at", `${todayET}T00:00:00-05:00`),
    // event_rsvps has no id/artist_slug/created_at: its columns are
    // event_id, fan_id, rsvp_at (0007) and community_id (0011).
    admin
      .from("event_rsvps")
      .select("event_id", { count: "exact", head: true })
      .eq("community_id", artistSlug)
      .gte("rsvp_at", weekAgo),
    admin
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("community_id", artistSlug)
      .gte("created_at", weekAgo),
    // fan_artist_following has no id/created_at: (fan_id, artist_slug,
    // followed_at) per 0006.
    admin
      .from("fan_artist_following")
      .select("fan_id", { count: "exact", head: true })
      .eq("artist_slug", artistSlug)
      .gte("followed_at", weekAgo),
  ]);

  return {
    checkinsToday: checkinsRes.status === "fulfilled" ? (checkinsRes.value.count ?? 0) : 0,
    rsvpsThisWeek: rsvpsRes.status === "fulfilled" ? (rsvpsRes.value.count ?? 0) : 0,
    postsThisWeek: postsRes.status === "fulfilled" ? (postsRes.value.count ?? 0) : 0,
    newFollowersThisWeek: followersRes.status === "fulfilled" ? (followersRes.value.count ?? 0) : 0,
  };
}
