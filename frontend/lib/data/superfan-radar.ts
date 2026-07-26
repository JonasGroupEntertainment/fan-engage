import { createSuperFanRadarClient } from "@/lib/superfan-radar/client";

/**
 * Read-only summary of an artist's Super Fan Radar data, pulled from the
 * sister app's Supabase project (Fan Analytics Dashboard / Super Fan
 * Radar). This repo does not track a numeric `artist_profile_id` of its
 * own — the closest existing identifier is the community slug resolved by
 * lib/admin.ts / lib/community.ts (`currentCommunityId`). Callers should
 * pass that in as `artistProfileId`. If Super Fan Radar's `tenants` table
 * has no matching row (very common — most artists haven't onboarded to
 * Super Fan Radar yet), this returns `connected: false` rather than an
 * error.
 */

export type SuperFanTier = "NONE" | "CANDIDATE" | "CORE" | "ELITE";

export interface TopSuperFan {
  username: string;
  platform: string;
  tier: SuperFanTier;
  index: number;
  outreachOptIn: boolean;
}

export type SuperFanRadarSummary =
  | { connected: false }
  | {
      connected: true;
      tenantId: string;
      tenantDisplayName: string;
      eliteCount: number;
      coreCount: number;
      candidateCount: number;
      inviteReadyCount: number;
      topFans: TopSuperFan[];
    };

const NOT_CONNECTED: SuperFanRadarSummary = { connected: false };

/**
 * Look up the Super Fan Radar tenant for this artist and, if connected,
 * return tier counts, invite-ready count, and the top 10 fans by Super Fan
 * Index. Server-side only — uses the FAD service role key.
 */
export async function getSuperFanRadarSummary(
  artistProfileId: string,
): Promise<SuperFanRadarSummary> {
  // tenants.artist_profile_id is an integer FK in the FAD schema. If the
  // id we were given isn't numeric, there's no way it matches a tenant.
  const numericProfileId = Number(artistProfileId);
  if (!Number.isFinite(numericProfileId)) return NOT_CONNECTED;

  let fad;
  try {
    fad = createSuperFanRadarClient();
  } catch {
    // FAD_SUPABASE_URL / FAD_SUPABASE_SERVICE_ROLE_KEY not configured yet.
    return NOT_CONNECTED;
  }

  const { data: tenant, error: tenantError } = await fad
    .from("tenants")
    .select("id, display_name")
    .eq("type", "ARTIST")
    .eq("artist_profile_id", numericProfileId)
    .maybeSingle();

  if (tenantError || !tenant) return NOT_CONNECTED;

  const { data: fans, error: fansError } = await fad
    .from("fans")
    .select("username, platform, super_fan_tier, super_fan_index, outreach_opt_in")
    .eq("tenant_id", tenant.id);

  if (fansError || !fans) return NOT_CONNECTED;

  let eliteCount = 0;
  let coreCount = 0;
  let candidateCount = 0;
  let inviteReadyCount = 0;

  for (const f of fans) {
    if (f.super_fan_tier === "ELITE") eliteCount++;
    else if (f.super_fan_tier === "CORE") coreCount++;
    else if (f.super_fan_tier === "CANDIDATE") candidateCount++;
    if (f.outreach_opt_in) inviteReadyCount++;
  }

  const topFans: TopSuperFan[] = [...fans]
    .sort((a, b) => (b.super_fan_index ?? 0) - (a.super_fan_index ?? 0))
    .slice(0, 10)
    .map((f) => ({
      username: f.username,
      platform: f.platform,
      tier: f.super_fan_tier as SuperFanTier,
      index: f.super_fan_index,
      outreachOptIn: f.outreach_opt_in,
    }));

  return {
    connected: true,
    tenantId: tenant.id,
    tenantDisplayName: tenant.display_name,
    eliteCount,
    coreCount,
    candidateCount,
    inviteReadyCount,
    topFans,
  };
}
