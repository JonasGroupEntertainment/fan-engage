import { getAdminContext, type AdminContext } from "@/lib/admin";
import { decideAdminAccess, type AdminRequirement } from "@/lib/admin-authz";

/**
 * Server-side admin guard. Every admin server action and admin API route
 * should call this before writing anything.
 *
 * It checks three things: the caller is signed in as an admin, holds the
 * right role, and is acting on a community they administer (or is a
 * super-admin). Callers map the failure reason to their own response
 * shape (redirect, error object, or JSON 401/403).
 */
export type AdminGuardResult =
  | { ok: true; ctx: AdminContext }
  | { ok: false; reason: "signed_out" | "forbidden"; ctx: AdminContext | null };

export async function authorizeAdmin(
  req: AdminRequirement,
  ctxIn?: AdminContext | null,
): Promise<AdminGuardResult> {
  const ctx = ctxIn === undefined ? await getAdminContext() : ctxIn;
  const decision = decideAdminAccess(ctx, req);
  if (decision.ok && ctx) return { ok: true, ctx };
  return {
    ok: false,
    reason: decision.ok ? "signed_out" : decision.reason,
    ctx: ctx ?? null,
  };
}

/** Status code helper for API routes. */
export function guardStatus(reason: "signed_out" | "forbidden"): 401 | 403 {
  return reason === "signed_out" ? 401 : 403;
}

/**
 * Throwing variant for server actions that already signal failure by
 * throwing. Returns the admin context on success.
 */
export async function assertAdmin(
  req: AdminRequirement,
  ctxIn?: AdminContext | null,
): Promise<AdminContext> {
  const guard = await authorizeAdmin(req, ctxIn);
  if (!guard.ok) throw new Error(guard.reason === "signed_out" ? "Unauthorized" : "Forbidden");
  return guard.ctx;
}

/**
 * Nullable variant for code paths that are shared with fans (for example
 * community pages). Returns the admin user only when the caller has at
 * least `minRole` in this one community (or is a super-admin).
 */
export async function communityAdminUser(
  communityId: string,
  minRole: AdminRequirement["minRole"] = "editor",
): Promise<AdminContext["user"] | null> {
  if (!communityId) return null;
  const guard = await authorizeAdmin({ communityId, minRole });
  return guard.ok ? guard.ctx.user : null;
}
