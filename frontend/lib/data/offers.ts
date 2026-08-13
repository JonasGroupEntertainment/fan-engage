import { createClient } from "@/lib/supabase/server";
import { isMisplacedNelliesOffer, isReservedRewardTitle } from "@/lib/launch-catalog";
import type { Offer } from "./types";

/**
 * Active offers. Empty list when Supabase isn't configured or returns no rows;
 * pages render their static preview data in that case.
 */
export async function getActiveOffers(): Promise<Offer[]> {
  try {
    const supabase = await createClient();
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("offers")
      .select("*")
      .eq("active", true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Offer[]).filter(
      (o) =>
        o.category !== "merch" &&
        !isReservedRewardTitle(o.title) &&
        !isMisplacedNelliesOffer(o.title),
    );
  } catch {
    return [];
  }
}

export async function getFeaturedOffers(limit = 3): Promise<Offer[]> {
  const offers = await getActiveOffers();
  return offers.slice(0, limit);
}
