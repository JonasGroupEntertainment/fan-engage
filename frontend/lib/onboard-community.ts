import { LAUNCH_COMMUNITY_ID } from "./launch-catalog.ts";

const COMMUNITY_SLUG_RE = /^[a-z0-9-]+$/;

/**
 * RaeLynn is the live launch community. Free Founding Fan #1–100 is claimed
 * on that membership row. A missing or non-community ref (fan invite code)
 * must still join RaeLynn — otherwise claim_founding_fan_status no-ops.
 */
export function resolveOnboardCommunityId(opts: {
  communitySlug?: string | null;
  referralCode?: string | null;
  knownCommunitySlugs?: readonly string[];
}): string {
  const candidate = (opts.communitySlug ?? opts.referralCode ?? "")
    .trim()
    .toLowerCase();
  if (!COMMUNITY_SLUG_RE.test(candidate)) return LAUNCH_COMMUNITY_ID;
  if (opts.knownCommunitySlugs && !opts.knownCommunitySlugs.includes(candidate)) {
    return LAUNCH_COMMUNITY_ID;
  }
  return candidate;
}
