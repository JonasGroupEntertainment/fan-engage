import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCommunityId } from "@/lib/community";
import type { FanKpis, FanProfile, Tier, TierSlug } from "./types";
import { getTiers } from "./tiers";

/**
 * Per-community membership row — the authoritative source of a fan's
 * points, tier, and referral code within a single community. Replaces
 * direct reads of `fans.total_points` / `fans.current_tier` in any
 * code path that's scoped to a specific community.
 */
export interface FanMembership {
  fan_id: string;
  community_id: string;
  joined_at: string;
  total_points: number;
  current_tier: TierSlug;
  referral_code: string | null;
  status: "active" | "suspended" | "pending";
}

/**
 * Fetch the signed-in fan's membership for the current community (or a
 * specific community_id if provided). Returns null for signed-out users,
 * fans without a membership in the community, or any DB error.
 */
export async function getCurrentMembership(
  communityId?: string,
): Promise<FanMembership | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const community = communityId ?? (await getCurrentCommunityId());

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("fan_community_memberships")
      .select("*")
      .eq("fan_id", user.id)
      .eq("community_id", community)
      .maybeSingle();

    if (error) {
      console.warn("getCurrentMembership: supabase error", error.message);
      return null;
    }
    return (data as FanMembership | null) ?? null;
  } catch (err) {
    console.warn("getCurrentMembership: failed", err);
    return null;
  }
}

/**
 * The signed-in fan's primary community: their earliest active membership.
 * Returns null for signed-out users or fans who haven't joined a community.
 */
export async function getPrimaryCommunityId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const admin = createAdminClient();
      const { data, error } = await admin
        .from("fan_community_memberships")
        .select("community_id, joined_at")
        .eq("fan_id", user.id)
        .eq("status", "active")
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.warn("getPrimaryCommunityId: supabase error", error.message);
      } else if (data?.community_id) {
        return data.community_id as string;
      }
    }

    // Logged-out visitors, or fans with no active membership yet: send them
    // to the single active artist's community rather than the bare
    // directory. Falls back to null (→ /artists) once there's more than one.
    return await getSoleActiveArtistSlug();
  } catch (err) {
    console.warn("getPrimaryCommunityId: failed", err);
    return null;
  }
}

/** Returns the lone active artist's slug, or null if there's zero or more than one. */
async function getSoleActiveArtistSlug(): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("artists")
      .select("slug")
      .eq("active", true)
      .limit(2);
    if (error || !data || data.length !== 1) return null;
    return data[0].slug as string;
  } catch (err) {
    console.warn("getSoleActiveArtistSlug: failed", err);
    return null;
  }
}

export interface PointBreakdownRow {
  source: string;
  label: string;
  total: number;
}

// Human-readable label per point source. Matches the enum in 0001_init.sql.
const SOURCE_LABELS: Record<string, string> = {
  signup_bonus: "Signup bonus",
  referral: "Referrals",
  challenge: "Challenges",
  purchase: "Purchases",
  manual_adjustment: "Adjustments",
  event_rsvp: "Event RSVPs",
  event_attended: "Events attended",
  social_share: "Social shares",
  daily_checkin: "Daily check-ins",
};

/**
 * Sum of points the current fan has earned, grouped by source. Returns an
 * empty array for signed-out users or when the fan has no ledger entries.
 */
export async function getPointBreakdown(): Promise<PointBreakdownRow[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("points_ledger")
      .select("source,delta")
      .eq("fan_id", user.id);
    if (error) throw error;

    const totals = new Map<string, number>();
    for (const row of data ?? []) {
      const source = row.source as string;
      totals.set(source, (totals.get(source) ?? 0) + (row.delta as number));
    }

    return [...totals.entries()]
      .filter(([, total]) => total !== 0)
      .map(([source, total]) => ({
        source,
        label: SOURCE_LABELS[source] ?? source,
        total,
      }))
      .sort((a, b) => b.total - a.total);
  } catch {
    return [];
  }
}

/**
 * Fetches the current user's fan profile. Returns null for signed-out or
 * unconfigured-Supabase — callers should fall back to static preview content.
 */
export async function getCurrentFan(): Promise<FanProfile | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("fans")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.warn("getCurrentFan: supabase error", error.message);
      return null;
    }

    return data as FanProfile | null;
  } catch (err) {
    console.warn("getCurrentFan: failed", err);
    return null;
  }
}

/**
 * Rolls up the fan's headline KPIs for the current community: total
 * points (from the community membership, not the legacy fans.total_points),
 * community-scoped referrals and badges, distance to next tier.
 */
export async function getCurrentFanKpis(): Promise<FanKpis | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const communityId = await getCurrentCommunityId();

    const admin = createAdminClient();
    const [membership, referralsRes, badgesRes, tiers, ledgerRes] = await Promise.all([
      getCurrentMembership(communityId),
      supabase
        .from("referrals")
        .select("id", { count: "exact", head: true })
        .eq("referrer_id", user.id)
        .eq("community_id", communityId),
      supabase
        .from("fan_badges")
        .select("badge_slug", { count: "exact", head: true })
        .eq("fan_id", user.id)
        .eq("community_id", communityId),
      getTiers(),
      admin.rpc("fan_ledger_balance", { p_fan_id: user.id }),
    ]);

    const total_points =
      typeof ledgerRes.data === "number"
        ? ledgerRes.data
        : membership?.total_points ?? 0;
    const referral_count = referralsRes.count ?? 0;
    const badge_count = badgesRes.count ?? 0;

    const next_tier =
      tiers
        .filter((t) => t.min_points > total_points)
        .sort((a, b) => a.min_points - b.min_points)[0] ?? null;

    const points_to_next_tier = next_tier
      ? Math.max(0, next_tier.min_points - total_points)
      : null;

    return {
      total_points,
      referral_count,
      badge_count,
      next_tier: (next_tier ?? null) as Tier | null,
      points_to_next_tier,
    };
  } catch (err) {
    console.warn("getCurrentFanKpis: failed", err);
    return null;
  }
}
