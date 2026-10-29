import { createAdminClient } from "@/lib/supabase/admin";
import { hasArtistKeyArt } from "@/lib/artist-keyart";
import { eventDayKey } from "@/lib/today/event-day";
import { easternDateString } from "@/lib/dates/eastern";
import { computeReadiness, type Readiness, type ReadinessInput } from "./readiness";

/**
 * Gather the launch-checklist inputs for one community and score them.
 * Service role: the portal needs inactive events, every team row and the
 * follower/push join, none of which the anon/authenticated policies
 * expose. Access is gated by the page (PORTAL_MIN_ROLE.launch).
 */
export async function loadReadiness(communityId: string, now: Date = new Date()): Promise<Readiness> {
  const admin = createAdminClient();

  const [artist, community, events, posts, rewards, presaves, team, followers] = await Promise.all([
    admin
      .from("artists")
      .select("name, tagline, bio, hero_image, social")
      .eq("slug", communityId)
      .maybeSingle(),
    admin
      .from("communities")
      .select("display_name, tagline, bio, hero_image, founder_cap")
      .eq("slug", communityId)
      .maybeSingle(),
    admin
      .from("artist_events")
      .select("event_date, starts_at, ends_at")
      .eq("community_id", communityId)
      .eq("active", true),
    admin
      .from("community_posts")
      .select("id", { count: "exact", head: true })
      .eq("artist_slug", communityId),
    admin
      .from("rewards_catalog")
      .select("id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .eq("active", true),
    admin
      .from("fan_actions")
      .select("id", { count: "exact", head: true })
      .eq("artist_slug", communityId)
      .eq("kind", "pre_save")
      .eq("active", true),
    admin
      .from("admin_users")
      .select("user_id", { count: "exact", head: true })
      .eq("community_id", communityId),
    admin.from("fan_artist_following").select("fan_id").eq("artist_slug", communityId),
  ]);

  const a = (artist.data ?? null) as {
    name: string | null;
    tagline: string | null;
    bio: string | null;
    hero_image: string | null;
    social: unknown;
  } | null;
  const c = (community.data ?? null) as {
    display_name: string | null;
    tagline: string | null;
    bio: string | null;
    hero_image: string | null;
    founder_cap: number | null;
  } | null;

  // Upcoming = the event's Eastern day is today or later. `ends_at` may not
  // exist on every deployment; eventDayKey ignores it when absent.
  const today = easternDateString(now);
  const upcomingEvents = ((events.data ?? []) as Array<{
    event_date: string | null;
    starts_at: string | null;
    ends_at?: string | null;
  }>).filter((e) => {
    const day = eventDayKey(e, now);
    return day !== null && day >= today;
  }).length;

  // Followers with at least one push subscription. push_subscriptions has
  // no community column, so join in app code on fan_id.
  const followerIds = Array.from(
    new Set(((followers.data ?? []) as Array<{ fan_id: string }>).map((f) => f.fan_id)),
  );
  let pushSubscribedFollowers = 0;
  if (followerIds.length > 0) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("fan_id")
      .in("fan_id", followerIds.slice(0, 5000));
    pushSubscribedFollowers = new Set(((subs ?? []) as Array<{ fan_id: string }>).map((s) => s.fan_id)).size;
  }

  const founderCap = c?.founder_cap ?? 0;
  const input: ReadinessInput = {
    slug: communityId,
    profile: {
      name: a?.name ?? c?.display_name ?? null,
      tagline: a?.tagline ?? c?.tagline ?? null,
      bio: a?.bio ?? c?.bio ?? null,
      heroImage: a?.hero_image ?? c?.hero_image ?? null,
      hasKeyArt: hasArtistKeyArt(communityId),
      socialCount: Array.isArray(a?.social) ? a.social.length : 0,
    },
    upcomingEvents,
    posts: posts.count ?? 0,
    activeRewards: rewards.count ?? 0,
    activePreSaves: presaves.count ?? 0,
    teamMembers: team.count ?? 0,
    pushSubscribedFollowers,
    foundersEnabled: founderCap > 0,
    founderCap,
  };
  return computeReadiness(input);
}
