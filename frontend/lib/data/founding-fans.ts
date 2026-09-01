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
export type FoundingFanRow = {
  fan_id: string;
  founding_fan_number: number;
  first_name: string | null;
  avatar_url: string | null;
  joined_at: string;
};

const foundingNumberFilter = {
  gte: 1,
  lte: FOUNDING_FAN_CAP,
} as const;

export async function getFoundingFanClaimState(
  communityId: string,
): Promise<FoundingFanClaimState> {
  try {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("fan_community_memberships")
      .select("fan_id", { count: "exact", head: true })
      .eq("community_id", communityId)
      .gte("founding_fan_number", foundingNumberFilter.gte)
      .lte("founding_fan_number", foundingNumberFilter.lte);
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

/** Same 1–100 set as the public counter — for the founders wall list. */
export async function listFoundingFans(
  communityId: string,
): Promise<FoundingFanRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("fan_community_memberships")
      .select(
        `
        fan_id,
        founding_fan_number,
        joined_at,
        fans:fans (
          id,
          first_name,
          avatar_url
        )
      `,
      )
      .eq("community_id", communityId)
      .gte("founding_fan_number", foundingNumberFilter.gte)
      .lte("founding_fan_number", foundingNumberFilter.lte)
      .order("founding_fan_number", { ascending: true });
    if (error || !data) {
      console.warn("listFoundingFans failed", error);
      return [];
    }
    return data
      .map((row: Record<string, unknown>) => {
        const fan = Array.isArray(row.fans) ? row.fans[0] : row.fans || {};
        const n = Number(row.founding_fan_number);
        return {
          fan_id: String(row.fan_id ?? ""),
          founding_fan_number: n,
          first_name: (fan as { first_name?: string | null }).first_name ?? null,
          avatar_url: (fan as { avatar_url?: string | null }).avatar_url ?? null,
          joined_at: String(row.joined_at ?? ""),
        };
      })
      .filter((f) => f.founding_fan_number >= 1 && f.founding_fan_number <= FOUNDING_FAN_CAP);
  } catch (err) {
    console.warn("listFoundingFans failed", err);
    return [];
  }
}
