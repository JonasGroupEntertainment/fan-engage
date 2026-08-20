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

export type LandingNextEvent = {
  title: string;
  date: string;
  location: string | null;
};

export type LandingStats = {
  activeArtists: number;
  activeEvents: number;
  foundingFans: number;
  foundingSpotsRemaining: number;
  foundingTarget: number;
  foundingPctClaimed: number;
  foundingClosed: boolean;
  nextEvent: LandingNextEvent | null;
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
    nextEvent: null,
  };

  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const [artistsRes, eventsRes, foundersRes, nextEventRes] = await Promise.all([
      admin
        .from("artists")
        .select("slug", { count: "exact", head: true })
        .eq("active", true),
      admin
        .from("artist_events")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .or(`starts_at.gte.${nowIso},ends_at.gte.${nowIso}`),
      admin
        .from("fan_community_memberships")
        .select("fan_id", { count: "exact", head: true })
        .eq("community_id", "raelynn")
        .not("founding_fan_number", "is", null),
      admin
        .from("artist_events")
        .select("title, event_date, location, starts_at")
        .eq("active", true)
        .eq("artist_slug", "raelynn")
        .or(`starts_at.gte.${nowIso},ends_at.gte.${nowIso}`)
        .order("starts_at", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const foundingFans = foundersRes.count ?? 0;
    const foundingSpotsRemaining = Math.max(0, FOUNDING_TARGET - foundingFans);
    const foundingPctClaimed = Math.min(
      100,
      Math.round((foundingFans / FOUNDING_TARGET) * 100),
    );
    const nextRow = nextEventRes.data as {
      title: string;
      event_date: string | null;
      location: string | null;
      starts_at: string | null;
    } | null;

    return {
      activeArtists: artistsRes.count ?? 0,
      activeEvents: eventsRes.count ?? 0,
      foundingFans,
      foundingSpotsRemaining,
      foundingTarget: FOUNDING_TARGET,
      foundingPctClaimed,
      foundingClosed: foundingSpotsRemaining === 0,
      nextEvent: nextRow
        ? {
            title: nextRow.title,
            date: nextRow.event_date ?? nextRow.starts_at ?? "Date TBA",
            location: nextRow.location,
          }
        : null,
    };
  } catch (err) {
    console.warn("getLandingStats failed", err);
    return fallback;
  }
}
