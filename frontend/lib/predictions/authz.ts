import type { AdminContext } from "@/lib/admin";
import { canAdminCommunity } from "../admin-authz.ts";

/**
 * Pure check: may this admin resolve a prediction that belongs to
 * `artistSlug`? `artistSlug` must come from the DB row, never the form.
 *
 * Super-admins may resolve anywhere. Everyone else must be working in
 * that community (the role on the context is for the current community
 * only) and hold owner or admin there. Delegates to the shared admin
 * guard in lib/admin-authz.ts.
 */
export function canResolvePrediction(
  ctx: Pick<AdminContext, "isSuperAdmin" | "communities" | "currentCommunityId" | "role"> | null,
  artistSlug: string | null | undefined,
): boolean {
  return canAdminCommunity(ctx, artistSlug, "admin");
}
