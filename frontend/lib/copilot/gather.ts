import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Artist Copilot — metric gathering.
 *
 * Pulls a 30-day pulse of one community so the copilot prompt (and the
 * portal UI) can reason over real numbers: growth, engagement, points
 * economy, upcoming events, redemption backlog, top fans, and — the
 * churn-risk signal — fans who were engaged but have gone quiet.
 */

export interface QuietFan {
  fanId: string;
  displayName: string | null;
  totalPoints: number;
  lastActiveDate: string | null;
  daysQuiet: number;
}

export interface TopFan {
  fanId: string;
  displayName: string | null;
  totalPoints: number;
  isFounder: boolean;
}

export interface CommunityPulse {
  communityId: string;
  displayName: string;
  memberCount: number;
  newMembers7d: number;
  newMembers30d: number;
  activeFans7d: number;
  pointsAwarded7d: number;
  posts7d: number;
  comments7d: number;
  rsvpsUpcoming: number;
  nextEvent: { title: string; startsAt: string; rsvps: number } | null;
  pendingRedemptions: number;
  topFans: TopFan[];
  quietFans: QuietFan[]; // churn risk: engaged before, silent 14–60 days
  founderCount: number;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function gatherCommunityPulse(
  communityId: string,
): Promise<CommunityPulse> {
  const admin = createAdminClient();

  const [
    community,
    members,
    new7,
    new30,
    ledger7,
    posts7,
    comments7,
    nextEvents,
    pendingRedemptions,
    topMemberships,
    founderCount,
  ] = await Promise.all([
    admin.from("communities").select("display_name").eq("slug", communityId).maybeSingle(),
    admin.from("fan_community_memberships").select("fan_id", { count: "exact", head: true }).eq("community_id", communityId),
    admin.from("fan_community_memberships").select("fan_id", { count: "exact", head: true }).eq("community_id", communityId).gte("joined_at", daysAgoIso(7)),
    admin.from("fan_community_memberships").select("fan_id", { count: "exact", head: true }).eq("community_id", communityId).gte("joined_at", daysAgoIso(30)),
    admin.from("points_ledger").select("fan_id, delta").eq("community_id", communityId).gte("created_at", daysAgoIso(7)),
    admin.from("community_posts").select("id", { count: "exact", head: true }).eq("artist_slug", communityId).gte("created_at", daysAgoIso(7)),
    admin.from("community_comments").select("id, community_posts!inner(artist_slug)", { count: "exact", head: true }).eq("community_posts.artist_slug", communityId).gte("created_at", daysAgoIso(7)),
    admin.from("artist_events").select("id, title, starts_at").eq("artist_slug", communityId).gte("starts_at", new Date().toISOString()).order("starts_at").limit(1),
    admin.from("reward_redemptions").select("id", { count: "exact", head: true }).eq("community_id", communityId).eq("status", "pending"),
    admin.from("fan_community_memberships").select("fan_id, total_points, is_founder").eq("community_id", communityId).order("total_points", { ascending: false }).limit(5),
    admin.from("fan_community_memberships").select("fan_id", { count: "exact", head: true }).eq("community_id", communityId).eq("is_founder", true),
  ]);

  // Points + unique active fans over 7d, from the community-scoped ledger.
  const ledgerRows = (ledger7.data ?? []) as Array<{ fan_id: string; delta: number }>;
  const pointsAwarded7d = ledgerRows.reduce((s, r) => s + Math.max(0, r.delta), 0);
  const activeFans7d = new Set(ledgerRows.map((r) => r.fan_id)).size;

  // Upcoming event RSVP count
  const next = ((nextEvents.data ?? []) as Array<{ id: string; title: string; starts_at: string }>)[0] ?? null;
  let nextEvent: CommunityPulse["nextEvent"] = null;
  let rsvpsUpcoming = 0;
  if (next) {
    const { count } = await admin
      .from("event_rsvps")
      .select("fan_id", { count: "exact", head: true })
      .eq("event_id", next.id);
    rsvpsUpcoming = count ?? 0;
    nextEvent = { title: next.title, startsAt: next.starts_at, rsvps: rsvpsUpcoming };
  }

  // Names for top fans
  const topRows = (topMemberships.data ?? []) as Array<{
    fan_id: string;
    total_points: number;
    is_founder: boolean;
  }>;
  const topIds = topRows.map((r) => r.fan_id);
  const { data: topFanRows } = topIds.length
    ? await admin.from("fans").select("id, handle, first_name, last_name").in("id", topIds)
    : { data: [] };
  const nameById = new Map(
    ((topFanRows ?? []) as Array<{
      id: string;
      handle: string | null;
      first_name: string | null;
      last_name: string | null;
    }>).map((f) => [
      f.id,
      f.handle || [f.first_name, f.last_name].filter(Boolean).join(" ") || null,
    ]),
  );
  const topFans: TopFan[] = topRows.map((r) => ({
    fanId: r.fan_id,
    displayName: nameById.get(r.fan_id) ?? null,
    totalPoints: r.total_points,
    isFounder: r.is_founder,
  }));

  // Churn risk: members with meaningful points whose fans.last_active_date
  // is 14–60 days old. (Older than 60 = churned, not "at risk".)
  const { data: memberRows } = await admin
    .from("fan_community_memberships")
    .select("fan_id, total_points")
    .eq("community_id", communityId)
    .gte("total_points", 100)
    .order("total_points", { ascending: false })
    .limit(200);
  const candidateIds = ((memberRows ?? []) as Array<{ fan_id: string; total_points: number }>);
  const pointsById = new Map(candidateIds.map((r) => [r.fan_id, r.total_points]));
  const { data: quietRows } = candidateIds.length
    ? await admin
        .from("fans")
        .select("id, handle, first_name, last_name, last_active_date")
        .in("id", candidateIds.map((r) => r.fan_id))
        .not("last_active_date", "is", null)
        .lte("last_active_date", daysAgoIso(14).slice(0, 10))
        .gte("last_active_date", daysAgoIso(60).slice(0, 10))
        .order("last_active_date", { ascending: true })
        .limit(15)
    : { data: [] };
  const today = Date.now();
  const quietFans: QuietFan[] = ((quietRows ?? []) as Array<{
    id: string;
    handle: string | null;
    first_name: string | null;
    last_name: string | null;
    last_active_date: string | null;
  }>).map((f) => ({
    fanId: f.id,
    displayName:
      f.handle || [f.first_name, f.last_name].filter(Boolean).join(" ") || null,
    totalPoints: pointsById.get(f.id) ?? 0,
    lastActiveDate: f.last_active_date,
    daysQuiet: f.last_active_date
      ? Math.floor((today - new Date(`${f.last_active_date}T00:00:00Z`).getTime()) / 86_400_000)
      : 0,
  }));

  return {
    communityId,
    displayName: (community.data?.display_name as string | undefined) ?? communityId,
    memberCount: members.count ?? 0,
    newMembers7d: new7.count ?? 0,
    newMembers30d: new30.count ?? 0,
    activeFans7d,
    pointsAwarded7d,
    posts7d: posts7.count ?? 0,
    comments7d: comments7.count ?? 0,
    rsvpsUpcoming,
    nextEvent,
    pendingRedemptions: pendingRedemptions.count ?? 0,
    topFans,
    quietFans,
    founderCount: founderCount.count ?? 0,
  };
}
