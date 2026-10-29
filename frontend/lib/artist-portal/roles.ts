/**
 * Pure artist-portal role rules. No I/O so they can be unit tested
 * directly; `access.ts` re-exports them next to the Supabase-backed
 * context resolver.
 *
 *   owner   — the artist (or their manager of record). Full control,
 *             including team management.
 *   admin   — day-to-day team lead. Everything except team management.
 *   editor  — can post/manage content, events, redemptions.
 *   viewer  — read-only (analytics, leaderboard, community view).
 */

export type PortalRole = "owner" | "admin" | "editor" | "viewer";

export const PORTAL_ROLE_RANK: Readonly<Record<PortalRole, number>> = {
  owner: 3,
  admin: 2,
  editor: 1,
  viewer: 0,
};

export function roleAtLeast(role: PortalRole, min: PortalRole): boolean {
  return PORTAL_ROLE_RANK[role] >= PORTAL_ROLE_RANK[min];
}

/**
 * Minimum role per portal surface. Pages and server actions read from
 * this table rather than hardcoding a role so the matrix lives in one
 * place.
 */
export const PORTAL_MIN_ROLE = {
  /** Dashboard overview — read-only. */
  dashboard: "viewer",
  /** Copilot brief — read-only view. */
  copilot: "viewer",
  /** Copilot refresh (writes a brief). */
  copilotRefresh: "editor",
  /** Community feed view. */
  community: "viewer",
  /** Creating / deleting community posts. */
  communityPost: "editor",
  /** Events management UI and its actions. */
  events: "editor",
  /** Redemptions management UI and its actions. */
  redemptions: "editor",
  /** Leaderboard — read-only analytics. */
  leaderboard: "viewer",
  /** Revenue / payout history — financial, admin and above. */
  revenue: "admin",
  /** Team management — owner only. */
  team: "owner",
} as const satisfies Record<string, PortalRole>;

export type PortalSurface = keyof typeof PORTAL_MIN_ROLE;

export function canAccessPortalSurface(
  role: PortalRole,
  surface: PortalSurface,
): boolean {
  return roleAtLeast(role, PORTAL_MIN_ROLE[surface]);
}
