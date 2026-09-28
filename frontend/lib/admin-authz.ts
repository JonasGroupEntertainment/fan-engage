import type { AdminContext } from "@/lib/admin";

/**
 * Pure admin authorization rules shared by every admin server action and
 * admin API route. No I/O here so it can be unit tested directly.
 *
 * The community passed in must come from the database row being changed
 * (or from the caller's own context), never from form input alone.
 */

export type AdminRole = NonNullable<AdminContext["role"]>;

export type AdminAuthzContext = Pick<
  AdminContext,
  "isSuperAdmin" | "communities" | "currentCommunityId" | "role"
>;

export const ROLE_RANK: Readonly<Record<AdminRole, number>> = {
  viewer: 1,
  editor: 2,
  admin: 3,
  owner: 4,
};

/** Default minimum role for admin writes: owner or admin. */
export const DEFAULT_MIN_ROLE: AdminRole = "admin";

export function roleAtLeast(
  role: AdminContext["role"],
  minRole: AdminRole,
): boolean {
  if (!role) return false;
  return (ROLE_RANK[role] ?? 0) >= ROLE_RANK[minRole];
}

export function isSuperAdminCtx(ctx: AdminAuthzContext | null | undefined): boolean {
  return Boolean(ctx?.isSuperAdmin);
}

/**
 * May this admin act on `communityId` with at least `minRole`?
 *
 * Super-admins may act anywhere. Everyone else must be working in that
 * community right now (the role on the context covers the current
 * community only), hold a grant for it, and have a high enough role.
 */
export function canAdminCommunity(
  ctx: AdminAuthzContext | null | undefined,
  communityId: string | null | undefined,
  minRole: AdminRole = DEFAULT_MIN_ROLE,
): boolean {
  if (!ctx || !communityId) return false;
  if (ctx.isSuperAdmin) return true;
  if (ctx.currentCommunityId !== communityId) return false;
  if (!ctx.communities.includes(communityId)) return false;
  return roleAtLeast(ctx.role, minRole);
}

export interface AdminRequirement {
  /** Community the action touches. Required unless superAdminOnly. */
  communityId?: string | null;
  /** Minimum role in that community. Defaults to "admin". */
  minRole?: AdminRole;
  /** Only super-admins may perform this action. */
  superAdminOnly?: boolean;
}

export type AdminDecision =
  | { ok: true }
  | { ok: false; reason: "signed_out" | "forbidden" };

/** Single decision function used by the server guard. */
export function decideAdminAccess(
  ctx: AdminAuthzContext | null | undefined,
  req: AdminRequirement,
): AdminDecision {
  if (!ctx) return { ok: false, reason: "signed_out" };
  if (req.superAdminOnly) {
    return ctx.isSuperAdmin ? { ok: true } : { ok: false, reason: "forbidden" };
  }
  return canAdminCommunity(ctx, req.communityId, req.minRole ?? DEFAULT_MIN_ROLE)
    ? { ok: true }
    : { ok: false, reason: "forbidden" };
}
