import { FALLBACK_TIERS, withCanonicalThresholds } from "@/lib/tier-thresholds";
import { createClient } from "@/lib/supabase/server";
import type { Tier, TierSlug } from "./types";

/**
 * Tier list. Always overlays TIER_MIN_POINTS (750 / 3,500 / 8,000) so
 * Fan Home and /rewards cannot drift from a stale `tiers` row.
 */
export async function getTiers(): Promise<Tier[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tiers")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    if (!data || data.length === 0) return FALLBACK_TIERS;
    return withCanonicalThresholds(data as Tier[]);
  } catch {
    return FALLBACK_TIERS;
  }
}

export function tierIcon(slug: TierSlug): string {
  return { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "👑" }[slug];
}
