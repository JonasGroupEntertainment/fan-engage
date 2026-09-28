import type { AdminContext } from "@/lib/admin";

/** Roles allowed to resolve a prediction (and so award points). */
const RESOLVER_ROLES: ReadonlyArray<AdminContext["role"]> = ["owner", "admin"];

/**
 * Pure check: may this admin resolve a prediction that belongs to
 * `artistSlug`? `artistSlug` must come from the DB row, never the form.
 *
 * Super-admins may resolve anywhere. Everyone else must be working in
 * that community (the role on the context is for the current community
 * only) and hold owner or admin there.
 */
export function canResolvePrediction(
  ctx: Pick<AdminContext, "isSuperAdmin" | "communities" | "currentCommunityId" | "role"> | null,
  artistSlug: string | null | undefined,
): boolean {
  if (!ctx || !artistSlug) return false;
  if (ctx.isSuperAdmin) return true;
  if (ctx.currentCommunityId !== artistSlug) return false;
  if (!ctx.communities.includes(artistSlug)) return false;
  return RESOLVER_ROLES.includes(ctx.role);
}
