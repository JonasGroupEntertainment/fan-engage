import { createAdminClient } from "@/lib/supabase/admin";
import { isHiddenFromPublicFoundingRoster } from "@/lib/founding-internal-fans";
import {
  FOUNDING_FAN_CAP,
  foundingClaimStateFromCount,
  isFoundingFanNumber,
  type FoundingFanClaimState,
} from "@/lib/points/economy";

/**
 * Public Founding Fan counters (homepage, /artists/[slug] campaign bar,
 * /premium remaining/claimed) share this helper so they cannot drift.
 *
 * Counted fans have an awarded `founding_fan_number` (>= 1) and are not
 * internal. Staff and test accounts keep their numbers and badges; they
 * are hidden here and do not consume one of the 100 spots.
 * Not the paid Premium founder flag, and not `community_goals.manual_current`.
 *
 * Remaining is always cap − claimed. Cap is `FOUNDING_FAN_CAP` (100).
 */

export { FOUNDING_FAN_CAP, foundingClaimStateFromCount };
export type { FoundingFanClaimState };

/**
 * Awarded founding numbers, excluding internal fans.
 * Shared by the public counter and the founders wall.
 */
export type FoundingFanRow = {
  fan_id: string;
  founding_fan_number: number;
  first_name: string | null;
  avatar_url: string | null;
  joined_at: string;
};

type FanEmbed = {
  id?: string;
  first_name?: string | null;
  avatar_url?: string | null;
  is_internal?: boolean | null;
};

const FOUNDING_SELECT_WITH_FLAG = `
  fan_id,
  founding_fan_number,
  joined_at,
  fans:fans (
    id,
    first_name,
    avatar_url,
    is_internal
  )
`;

const FOUNDING_SELECT_WITHOUT_FLAG = `
  fan_id,
  founding_fan_number,
  joined_at,
  fans:fans (
    id,
    first_name,
    avatar_url
  )
`;

function publicFoundingRows(data: unknown): FoundingFanRow[] {
  const rows = Array.isArray(data) ? data : [];
  return rows.flatMap((entry) => {
    const row = entry as Record<string, unknown>;
    const fan = (Array.isArray(row.fans) ? row.fans[0] : row.fans || {}) as FanEmbed;
    const fanId = String(row.fan_id ?? "");
    const foundingFanNumber = Number(row.founding_fan_number);
    if (!isFoundingFanNumber(foundingFanNumber)) return [];
    if (isHiddenFromPublicFoundingRoster(fanId, fan.is_internal)) return [];
    return [
      {
        fan_id: fanId,
        founding_fan_number: foundingFanNumber,
        first_name: fan.first_name ?? null,
        avatar_url: fan.avatar_url ?? null,
        joined_at: String(row.joined_at ?? ""),
      },
    ];
  });
}

async function loadFoundingMemberships(communityId: string): Promise<FoundingFanRow[]> {
  const admin = createAdminClient();
  const run = (columns: string) =>
    admin
      .from("fan_community_memberships")
      .select(columns)
      .eq("community_id", communityId)
      .gte("founding_fan_number", 1)
      .order("founding_fan_number", { ascending: true });

  let { data, error } = await run(FOUNDING_SELECT_WITH_FLAG);
  if (error && /is_internal/i.test(error.message ?? "")) {
    ({ data, error } = await run(FOUNDING_SELECT_WITHOUT_FLAG));
  }
  if (error || !data) {
    console.warn("loadFoundingMemberships failed", error);
    return [];
  }
  return publicFoundingRows(data);
}

export async function getFoundingFanClaimState(
  communityId: string,
): Promise<FoundingFanClaimState> {
  try {
    const fans = await loadFoundingMemberships(communityId);
    return foundingClaimStateFromCount(fans.length);
  } catch (err) {
    console.warn("getFoundingFanClaimState failed", err);
    return foundingClaimStateFromCount(0);
  }
}

/** Same public set as the counter — for the founders wall list. */
export async function listFoundingFans(
  communityId: string,
): Promise<FoundingFanRow[]> {
  try {
    return await loadFoundingMemberships(communityId);
  } catch (err) {
    console.warn("listFoundingFans failed", err);
    return [];
  }
}
