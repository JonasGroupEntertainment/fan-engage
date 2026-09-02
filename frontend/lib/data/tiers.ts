import { FALLBACK_TIERS } from "@/lib/tier-thresholds";
import { createClient } from "@/lib/supabase/server";
import type { Tier, TierSlug } from "./types";

/**
 * Tier list. Falls back to TIER_MIN_POINTS (750 / 3,500 / 8,000) when
 * Supabase isn't reachable — same ladder as the badge gallery.
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
    return data as Tier[];
  } catch {
    return FALLBACK_TIERS;
  }
}

export function tierIcon(slug: TierSlug): string {
  return { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "👑" }[slug];
}
