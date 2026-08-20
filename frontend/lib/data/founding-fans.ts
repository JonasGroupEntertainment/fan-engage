import { createAdminClient } from "@/lib/supabase/admin";
import {
  FOUNDING_FAN_CAP,
  foundingClaimStateFromCount,
  type FoundingFanClaimState,
} from "@/lib/points/economy";

/**
 * Public Founding Fan counters (homepage, /artists/[slug] campaign bar,
 * /premium remaining/claimed) share this helper so they cannot drift.
 *
 * Authoritative claimed count is the same definition the writer uses for
 * 1.5×: `founding_fan_number` 1–100 via `isFoundingFanNumber`.
 * Not `is_founder` (paid Premium slots), not `community_goals.manual_current`,
 * and not “any non-null founding_fan_number” (would include 0 / 101+).
 *
 * Remaining is always cap − claimed. Cap is `FOUNDING_FAN_CAP` (100),
 * not `communities.founder_cap`.
 */

export { FOUNDING_FAN_CAP, foundingClaimStateFromCount };
export type { FoundingFanClaimState };

/**
 * Count memberships whose founding number is 1–100.
 * Single query used by every guest-facing founding counter.
 */
export async function getFoundingFanClaimState(
  communityId: string,
): Promise<FoundingFanClaimState> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("fan_community_memberships")
      .select("fan_id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .gte("founding_fan_number", 1)
      .lte("founding_fan_number", FOUNDING_FAN_CAP);
    if (error) {
      console.warn("getFoundingFanClaimState failed", error);
      return foundingClaimStateFromCount(0);
    }
    return foundingClaimStateFromCount(count ?? 0);
  } catch (err) {
    console.warn("getFoundingFanClaimState failed", err);
    return foundingClaimStateFromCount(0);
  }
}
