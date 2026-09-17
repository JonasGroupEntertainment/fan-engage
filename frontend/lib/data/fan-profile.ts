import { createAdminClient } from "@/lib/supabase/admin";
import { isPremium } from "@/lib/entitlements-core";

/**
 * Public fan profile data layer.
 *
 * Returns ONLY public-safe fields — never email, phone, stripe ids,
 * last login, moderation flags, or anything else that could be used
 * for harassment, account discovery, or impersonation.
 *
 * Schema notes (post 0035):
 *   - profile_slug    URL-safe slug used by /fans/<slug>
 *   - socials (jsonb) social handles, e.g. {"instagram_or_tiktok": "@x"}
 *   - handle (legacy) deprecated; null for new rows after 0035 trigger
 *
 * If public_profile_enabled is false the function returns null and
 * the route 404s — opt-out without leaking that the slug exists.
 */

export interface FanSocials {
  instagram_or_tiktok?: string | null;
}

export interface PublicFounderBadge {
  communitySlug: string;
  communityName: string;
  accentFrom: string;
  accentTo: string;
  founderNumber: number;
}

export interface PublicBadge {
  slug: string;
  name: string;
  description: string | null;
  earnedAt: string;
}

export interface PublicCommunity {
  slug: string;
  name: string;
}

export interface PublicPost {
  id: string;
  title: string | null;
  body: string | null;
  createdAt: string;
  artistSlug: string | null;
  artistName: string | null;
}

export interface PublicFanProfile {
  profileSlug: string;
  firstName: string | null;
  avatarUrl: string | null;
  tier: string;
  totalPoints: number;
  memberSince: string;
  socials: FanSocials;
  founderBadges: PublicFounderBadge[];
  isPremium: boolean;
  badges: PublicBadge[];
  communities: PublicCommunity[];
  recentPosts: PublicPost[];
}

export async function getFanProfileBySlug(
  slug: string,
): Promise<PublicFanProfile | null> {
  const admin = createAdminClient();
  const normalized = slug.toLowerCase();

  const { data: fan, error: fanError } = await admin
    .from("fans")
    .select(
      "id, profile_slug, first_name, avatar_url, current_tier, total_points, created_at, public_profile_enabled, socials",
    )
    .ilike("profile_slug", normalized)
    .maybeSingle();

  if (fanError || !fan) return null;
  if (fan.public_profile_enabled === false) return null;

  const [founderRes, badgesRes, followingRes, postsRes, premiumRes] = await Promise.all([
    admin
      .from("fan_community_memberships")
      .select(
        "community_id, founder_number, communities!inner ( slug, display_name, accent_from, accent_to )",
      )
      .eq("fan_id", fan.id)
      .eq("is_founder", true)
      .order("founder_number", { ascending: true }),
    admin
      .from("fan_badges")
      .select("earned_at, badges!inner ( slug, name, description )")
      .eq("fan_id", fan.id)
      .order("earned_at", { ascending: false }),
    admin
      .from("fan_artist_following")
      .select("artists!inner ( slug, name )")
      .eq("fan_id", fan.id),
    admin
      .from("community_posts")
      .select("id, title, body, created_at, artist_slug, artists ( name )")
      .eq("author_id", fan.id)
      .eq("kind", "post")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("fan_community_memberships")
      .select("subscription_tier")
      .eq("fan_id", fan.id)
      .in("subscription_tier", ["premium", "comped", "past_due"])
      .limit(1),
  ]);

  type FounderRow = {
    community_id: string;
    founder_number: number;
    communities: {
      slug: string;
      display_name: string;
      accent_from: string;
      accent_to: string;
    };
  };
  type BadgeRow = {
    earned_at: string;
    badges: { slug: string; name: string; description: string | null };
  };
  type FollowRow = { artists: { slug: string; name: string } };
  type PostRow = {
    id: string;
    title: string | null;
    body: string | null;
    created_at: string;
    artist_slug: string | null;
    artists: { name: string } | null;
  };

  const founders = (founderRes.data ?? []) as unknown as FounderRow[];
  const badges = (badgesRes.data ?? []) as unknown as BadgeRow[];
  const following = (followingRes.data ?? []) as unknown as FollowRow[];
  const posts = (postsRes.data ?? []) as unknown as PostRow[];
  const premiumRows = (premiumRes.data ?? []) as Array<{
    subscription_tier: string | null;
  }>;

  return {
    profileSlug: fan.profile_slug as string,
    firstName: fan.first_name as string | null,
    avatarUrl: fan.avatar_url as string | null,
    tier: (fan.current_tier as string | null) ?? "bronze",
    totalPoints: (fan.total_points as number | null) ?? 0,
    memberSince: fan.created_at as string,
    socials: ((fan.socials as FanSocials | null) ?? {}) as FanSocials,
    founderBadges: founders.map((m) => ({
      communitySlug: m.communities.slug,
      communityName: m.communities.display_name,
      accentFrom: m.communities.accent_from ?? "#7c3aed",
      accentTo: m.communities.accent_to ?? "#fb923c",
      founderNumber: m.founder_number,
    })),
    isPremium: premiumRows.some((row) => isPremium(row.subscription_tier)),
    badges: badges.map((b) => ({
      slug: b.badges.slug,
      name: b.badges.name,
      description: b.badges.description,
      earnedAt: b.earned_at,
    })),
    communities: following.map((f) => ({
      slug: f.artists.slug,
      name: f.artists.name,
    })),
    recentPosts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      createdAt: p.created_at,
      artistSlug: p.artist_slug,
      artistName: p.artists?.name ?? null,
    })),
  };
}

export async function getFanProfileSlug(
  fanId: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("fans")
    .select("profile_slug")
    .eq("id", fanId)
    .maybeSingle();
  return (data?.profile_slug as string | null) ?? null;
}
