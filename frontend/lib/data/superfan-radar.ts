import { createSuperFanRadarClient } from "@/lib/superfan-radar/client";
import {
  summarizeSuperFans,
  type SuperFanRadarSummary,
  type SuperFanRow,
} from "@/lib/superfan-radar/summarize";

export type {
  SuperFanCounts,
  SuperFanRadarSummary,
  SuperFanRow,
  SuperFanTier,
  TopSuperFan,
} from "@/lib/superfan-radar/summarize";

/**
 * Read-only summary of a community's Super Fan Radar data, pulled from the
 * sister app's Supabase project (Fan Analytics Dashboard / Super Fan Radar).
 *
 * The bridge between the two apps is the slug: a Fan Engage community slug
 * (`admin_users.community_id`, `communities.slug`) is expected to match a
 * Super Fan Radar `tenants.slug` row of type ARTIST. When there is no such
 * tenant (most artists have not onboarded to Super Fan Radar yet), this
 * returns `connected: false` rather than throwing.
 */

const NOT_CONNECTED: SuperFanRadarSummary = { connected: false };

/**
 * Look up the Super Fan Radar tenant for this community slug and, if
 * connected, return tier counts, the invite-ready count, and the top fans by
 * Super Fan Index. Server-side only: uses the Super Fan Radar service role.
 */
export async function getSuperFanRadarSummary(
  communitySlug: string,
): Promise<SuperFanRadarSummary> {
  if (!communitySlug) return NOT_CONNECTED;

  let radar: ReturnType<typeof createSuperFanRadarClient>;
  try {
    radar = createSuperFanRadarClient();
  } catch {
    // FAD_SUPABASE_URL / FAD_SUPABASE_SERVICE_ROLE_KEY not configured yet.
    return NOT_CONNECTED;
  }

  const { data: tenant, error: tenantError } = await radar
    .from("tenants")
    .select("id, display_name")
    .eq("type", "ARTIST")
    .eq("slug", communitySlug)
    .maybeSingle();

  if (tenantError) {
    console.warn("[superfan-radar] tenant lookup failed:", tenantError.message);
    return NOT_CONNECTED;
  }
  if (!tenant) return NOT_CONNECTED;

  const { data: fans, error: fansError } = await radar
    .from("fans")
    .select("username, platform, super_fan_tier, super_fan_index, outreach_opt_in")
    .eq("tenant_id", tenant.id);

  if (fansError || !fans) {
    console.warn("[superfan-radar] fans query failed:", fansError?.message ?? "no rows");
    return NOT_CONNECTED;
  }

  return {
    connected: true,
    tenantId: tenant.id as string,
    tenantDisplayName: tenant.display_name as string,
    ...summarizeSuperFans(fans as SuperFanRow[]),
  };
}
