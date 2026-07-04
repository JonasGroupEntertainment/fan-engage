import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Artist-portal access resolution.
 *
 * A user can enter the portal if they hold ANY role on a community in
 * admin_users (owner / admin / editor / viewer) — not just owner. Roles:
 *
 *   owner   — the artist (or their manager of record). Full control,
 *             including team management.
 *   admin   — day-to-day team lead. Everything except team management.
 *   editor  — can post/manage content, events, redemptions.
 *   viewer  — read-only (analytics, leaderboard, community view).
 *
 * Super-admins (community_id = '*') get portal access to the first active
 * community so JG staff can see what artists see.
 */

export type PortalRole = "owner" | "admin" | "editor" | "viewer";

export interface PortalContext {
  user: User;
  communityId: string;
  role: PortalRole;
}

const ROLE_RANK: Record<PortalRole, number> = {
  owner: 3,
  admin: 2,
  editor: 1,
  viewer: 0,
};

export function roleAtLeast(role: PortalRole, min: PortalRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export async function getPortalContext(): Promise<PortalContext | null> {
  let user: User | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    return null;
  }
  if (!user) return null;

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("admin_users")
    .select("community_id, role")
    .eq("user_id", user.id);

  const grants = (rows ?? []) as Array<{
    community_id: string;
    role: PortalRole;
  }>;
  if (grants.length === 0) return null;

  // Prefer a concrete community grant; take the highest role if several.
  const concrete = grants
    .filter((g) => g.community_id !== "*")
    .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role]);
  if (concrete.length > 0) {
    return { user, communityId: concrete[0].community_id, role: concrete[0].role };
  }

  // Super-admin only — view the first active community as owner.
  const { data: firstCommunity } = await admin
    .from("communities")
    .select("slug")
    .eq("active", true)
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  if (!firstCommunity?.slug) return null;
  return { user, communityId: firstCommunity.slug as string, role: "owner" };
}
