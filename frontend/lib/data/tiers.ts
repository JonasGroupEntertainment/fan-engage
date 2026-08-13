import { createClient } from "@/lib/supabase/server";
import type { Tier, TierSlug } from "./types";

const FALLBACK: Tier[] = [
  { slug: "bronze",   display_name: "Bronze",    min_points: 0,     perks: ["Welcome badge", "Access to fan home"], sort_order: 1 },
  { slug: "silver",   display_name: "Silver",    min_points: 750,   perks: ["Priority digital drops", "Leaderboard boost"], sort_order: 2 },
  { slug: "gold",     display_name: "Gold",      min_points: 3500,  perks: ["Exclusive digital unlocks", "Early event RSVPs"], sort_order: 3 },
  { slug: "platinum", display_name: "Platinum",  min_points: 8000,  perks: ["All-access digital catalog", "Priority event RSVPs"], sort_order: 4 },
];

/**
 * Tier list. Falls back to the seeded reference data if Supabase isn't
 * reachable — safe because those values are committed in 0001_init.sql.
 */
export async function getTiers(): Promise<Tier[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tiers")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    if (!data || data.length === 0) return FALLBACK;
    return data as Tier[];
  } catch {
    return FALLBACK;
  }
}

export function tierIcon(slug: TierSlug): string {
  return { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "👑" }[slug];
}
