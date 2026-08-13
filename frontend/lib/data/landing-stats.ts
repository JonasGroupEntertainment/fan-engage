import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Live stats shown on the signed-out landing — used by the
 * <FoundingFanBlock> countdown and the small "proof" tiles row above
 * the existing How-it-works section.
 *
 * First 100 Founding Fan is a persisted membership number, not a date
 * window and not paid Founding Fan pricing.
 */

export const FOUNDING_TARGET = 100;

export type LandingStats = {
  activeArtists: number;
  activeEvents: number;
  foundingFans: number;
  foundingSpotsRemaining: number;
  foundingTarget: number;
  foundingPctClaimed: number;
  foundingClosed: boolean;
};

export async function getLandingStats(): Promise<LandingStats> {
  const fallback: LandingStats = {
    activeArtists: 0,
    activeEvents: 0,
    foundingFans: 0,
    foundingSpotsRemaining: FOUNDING_TARGET,
    foundingTarget: FOUNDING_TARGET,
    foundingPctClaimed: 0,
    foundingClosed: false,
  };

  try {
    const admin = createAdminClient();
    const [artistsRes, eventsRes, foundersRes] = await Promise.all([
      admin
        .from("artists")
        .select("slug", { count: "exact", head: true })
        .eq("active", true),
      admin
        .from("artist_events")
        .select("id", { count: "exact", head: true })
        .eq("active", true),
      admin
        .from("fan_community_memberships")
        .select("fan_id", { count: "exact", head: true })
        .eq("community_id", "raelynn")
        .not("founding_fan_number", "is", null),
    ]);

    const foundingFans = foundersRes.count ?? 0;
    const foundingSpotsRemaining = Math.max(0, FOUNDING_TARGET - foundingFans);
    const foundingPctClaimed = Math.min(
      100,
      Math.round((foundingFans / FOUNDING_TARGET) * 100),
    );

    return {
      activeArtists: artistsRes.count ?? 0,
      activeEvents: eventsRes.count ?? 0,
      foundingFans,
      foundingSpotsRemaining,
      foundingTarget: FOUNDING_TARGET,
      foundingPctClaimed,
      foundingClosed: foundingSpotsRemaining === 0,
    };
  } catch (err) {
    console.warn("getLandingStats failed", err);
    return fallback;
  }
}
