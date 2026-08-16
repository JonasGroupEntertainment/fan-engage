import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * Multi-tenant community resolver (Phase 4b)
 *
 * Every request runs through middleware which inspects the hostname and
 * sets an `x-community-id` header. Server components, server actions, and
 * data-layer functions read that header via `getCurrentCommunityId()` and
 * scope their queries accordingly.
 *
 * For the legacy domain (fan-engage-pearl.vercel.app) and local dev we
 * fall back to RaeLynn, keeping single-tenant parity until wildcard DNS
 * is pointed at the platform.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface Community {
  slug: string;
  display_name: string;
  type: "artist" | "label_meta" | "brand";
  tagline: string | null;
  bio: string | null;
  accent_from: string;
  accent_to: string;
  hero_image: string | null;
  logo_url: string | null;
  subdomain: string | null;
  active: boolean;
  sort_order: number;
}

/** Fallback community for hostnames that don't match a known subdomain.
 *  Applies to fan-engage-pearl.vercel.app, localhost, and any apex request.
 *  Keeps today's deployment working as a single-tenant RaeLynn site until
 *  subdomains are configured. */
export const DEFAULT_COMMUNITY_ID = "raelynn";

/** Subdomain → community_slug map. MUST stay in sync with the
 *  communities.subdomain column in the DB. When adding a new community,
 *  update both places. `amystroup` and `dangertwins` are separate
 *  invite/community pools, not one list. */
export const COMMUNITY_BY_SUBDOMAIN: Record<string, string> = {
  raelynn: "raelynn",
  dangertwins: "danger-twins",
  amystroup: "amy-stroup", // separate pool from Danger Twins — not an alias
  danmarshall: "dan-marshall",
  hunterhawkins: "hunter-hawkins",
  streetteam: "street-team",
  nellies: "nellies",
};

/**
 * Resolve a community id from an HTTP host header. Called by middleware
 * (edge runtime) so it MUST NOT hit the database — the map above is the
 * source of truth for resolution.
 *
 * Examples:
 *   'raelynn.fanengage.app'          → 'raelynn'
 *   'streetteam.fanengage.app'       → 'street-team'
 *   'fan-engage-pearl.vercel.app'    → 'raelynn'  (legacy default)
 *   'fanengage.app'                  → 'raelynn'  (apex, for now)
 *   'localhost:3000'                 → 'raelynn'  (dev)
 */
export function resolveCommunityFromHost(host: string | null | undefined): string {
  if (!host) return DEFAULT_COMMUNITY_ID;
  const hostname = host.split(":")[0].toLowerCase();

  // Production *.fanengage.app subdomains
  const fanengageMatch = hostname.match(/^([a-z0-9-]+)\.fanengage\.app$/);
  if (fanengageMatch) {
    return COMMUNITY_BY_SUBDOMAIN[fanengageMatch[1]] ?? DEFAULT_COMMUNITY_ID;
  }

  // Vercel preview subdomains for per-community deploys, e.g.
  // 'raelynn-fan-engage-<hash>-jonas-group.vercel.app'. We don't use
  // these today, but this pattern is easy to add later.

  return DEFAULT_COMMUNITY_ID;
}

/**
 * Read the community id set by middleware on the current request. For
 * use in RSCs, server actions, and data-layer functions.
 *
 * If the header isn't set (e.g. a request that bypasses middleware, or
 * a build-time / static render) we fall back to the default.
 */
export async function getCurrentCommunityId(): Promise<string> {
  try {
    const h = await headers();
    return h.get("x-community-id") ?? DEFAULT_COMMUNITY_ID;
  } catch {
    // headers() throws outside of a request context (e.g. during build).
    return DEFAULT_COMMUNITY_ID;
  }
}

/**
 * Fetch the full community row from the DB — used for theming (accent
 * colors, hero image, display name) and metadata. Small module-level
 * cache keyed by slug to avoid hammering the DB on every RSC render.
 */
const communityCache = new Map<string, { at: number; row: Community | null }>();
const CACHE_TTL_MS = 30_000;

export async function getCommunity(slug: string): Promise<Community | null> {
  const hit = communityCache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.row;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("communities")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.warn("getCommunity: supabase error", error.message);
    return null;
  }
  const row = (data as Community | null) ?? null;
  communityCache.set(slug, { at: Date.now(), row });
  return row;
}

/** Convenience: fetch the community for the current request. */
export async function getCurrentCommunity(): Promise<Community | null> {
  const id = await getCurrentCommunityId();
  return getCommunity(id);
}
