import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCommunityId } from "@/lib/community";
import { pickViewerCommunity } from "@/lib/community-default";

export { pickViewerCommunity };

/**
 * Which community does this viewer "belong" to on a surface that has no
 * `[slug]` in the route (e.g. /rewards, /recap, Fan Home)?
 *
 *   1. The hostname community, when the fan is a member of it (a fan
 *      browsing raelynn.fanengage.app who follows RaeLynn stays there).
 *   2. Otherwise the fan's primary membership — earliest `joined_at`.
 *   3. Otherwise the hostname community (`x-community-id` from middleware).
 *   4. Otherwise DEFAULT_COMMUNITY_SLUG.
 *
 * Pure selection logic lives in `pickViewerCommunity` so it can be tested
 * without a request context.
 */
export async function getViewerMemberships(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    // Admin client: membership RLS is scoped per community and a fan's
    // cross-community rows are not guaranteed readable through the user key.
    const { data } = await createAdminClient()
      .from("fan_community_memberships")
      .select("community_id, joined_at")
      .eq("fan_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true });
    return ((data ?? []) as Array<{ community_id: string }>).map((m) => m.community_id);
  } catch {
    return [];
  }
}

/** Resolved community slug for the current viewer (see module doc). */
export async function getViewerCommunityId(): Promise<string> {
  const [memberSlugs, hostSlug] = await Promise.all([
    getViewerMemberships(),
    getCurrentCommunityId(),
  ]);
  return pickViewerCommunity({ memberSlugs, hostSlug });
}
