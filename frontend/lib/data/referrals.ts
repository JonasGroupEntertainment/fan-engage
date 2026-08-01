import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { LeaderboardRow, Referral } from "./types";

export interface ReferralActivityRow {
  id: string;
  first_name: string;
  status: string;
  points_awarded: number;
  created_at: string;
}

export async function getMyReferrals(): Promise<Referral[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from("referrals")
      .select("*")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Referral[];
  } catch {
    return [];
  }
}

/**
 * Top referrers leaderboard, aggregated site-wide with the admin client
 * (bypasses RLS — this is public aggregate info, not per-user data) and
 * joined to `fans` for a real first-name display.
 */
export async function getReferralLeaderboard(limit = 10): Promise<LeaderboardRow[]> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.from("referrals").select("referrer_id");
    if (error) throw error;
    if (!data || data.length === 0) return [];

    const counts = new Map<string, number>();
    for (const r of data) {
      counts.set(r.referrer_id, (counts.get(r.referrer_id) ?? 0) + 1);
    }

    const top = [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit);
    if (top.length === 0) return [];

    const { data: fans, error: fansError } = await admin
      .from("fans")
      .select("id, first_name")
      .in("id", top.map(([fan_id]) => fan_id));
    if (fansError) throw fansError;

    const nameById = new Map((fans ?? []).map((f) => [f.id, f.first_name as string | null]));

    return top.map(([fan_id, referral_count]) => ({
      fan_id,
      display_name: nameById.get(fan_id) || "A fan",
      referral_count,
    }));
  } catch {
    return [];
  }
}

/**
 * Recent site-wide referral activity, anonymized to first name only, for the
 * "Recent activity" feed shown to anonymous visitors and as a fallback when a
 * signed-in fan has no referrals of their own yet.
 */
export async function getRecentReferralActivity(limit = 5): Promise<ReferralActivityRow[]> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("referrals")
      .select("id, referrer_id, status, points_awarded, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    if (!data || data.length === 0) return [];

    const { data: fans, error: fansError } = await admin
      .from("fans")
      .select("id, first_name")
      .in("id", data.map((r) => r.referrer_id));
    if (fansError) throw fansError;

    const nameById = new Map((fans ?? []).map((f) => [f.id, f.first_name as string | null]));

    return data.map((r) => ({
      id: r.id,
      first_name: nameById.get(r.referrer_id) || "A fan",
      status: r.status,
      points_awarded: r.points_awarded ?? 0,
      created_at: r.created_at,
    }));
  } catch {
    return [];
  }
}
