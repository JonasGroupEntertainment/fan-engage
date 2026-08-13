import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Phase F.2 — Initialize a community from an approved application.
 *
 * Idempotent. Safe to re-run if the wizard hits an error mid-init.
 *
 * Steps (each guarded by NOT EXISTS or ON CONFLICT DO NOTHING):
 *   1. Insert artists row using application data
 *   2. Insert communities row (active=false initially; admin flips on
 *      "Mark setup complete")
 *   3. Seed default 4-pack of rewards (mirrors RaeLynn's catalog)
 *   4. Insert pinned welcome announcement post
 *
 * If the artist row already exists, all subsequent steps are no-ops.
 *
 * Returns { ok, created, message } so the caller can render a toast.
 */

const KEVIN_FAN_ID = "bf02e0cf-b740-407a-9436-222becfc3c49";

const DEFAULT_REWARDS: Array<{
  title: string;
  description: string;
  point_cost: number;
  kind: string;
  sort_order: number;
}> = [
  { title: "Phone Wallpaper", description: "Exclusive phone wallpaper for community members.", point_cost: 250, kind: "custom", sort_order: 0 },
  { title: "Lyric Wallpaper", description: "Exclusive lyric wallpaper for community members.", point_cost: 500, kind: "custom", sort_order: 1 },
  { title: "Fan Spotlight", description: "Get featured in the in-app fan feed.", point_cost: 1000, kind: "custom", sort_order: 3 },
  { title: "VIP Moment Raffle", description: "Enter a raffle for a VIP moment at the next available show.", point_cost: 5000, kind: "experience", sort_order: 4 },
];

export interface InitializeResult {
  ok: boolean;
  created: {
    artist: boolean;
    community: boolean;
    rewards: number;
    welcomePost: boolean;
  };
  message?: string;
  error?: string;
}

export async function initializeCommunityFromApplication(
  slug: string,
): Promise<InitializeResult> {
  const result: InitializeResult = {
    ok: false,
    created: { artist: false, community: false, rewards: 0, welcomePost: false },
  };

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return { ...result, error: "invalid_slug" };
  }

  try {
    const admin = createAdminClient();

    // 1. Find the approved application that maps to this slug.
    const { data: app } = await admin
      .from("applications")
      .select(
        "id, display_name, slug_suggestion, approved_slug, tagline, bio, hero_image, social, genres",
      )
      .eq("approved_slug", slug)
      .maybeSingle();

    // No app row — that's OK. The wizard supports manually-created
    // communities too. We just won't have the application data to seed.
    const display_name = (app?.display_name as string | undefined) ?? slug;
    const tagline = (app?.tagline as string | null) ?? null;
    const bio = (app?.bio as string | null) ?? null;
    const hero_image = (app?.hero_image as string | null) ?? null;
    const social = (app?.social as { label: string; href: string }[] | null) ?? [];
    const genres = (app?.genres as string[] | null) ?? null;

    // 2. Insert artists row if missing
    {
      const { data: existing } = await admin
        .from("artists")
        .select("slug")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) {
        const { error } = await admin.from("artists").insert({
          slug,
          name: display_name,
          tagline,
          bio,
          hero_image,
          social,
          genres,
          active: true,
          accent_from: "#7C3AED",
          accent_to: "#EC4899",
        });
        if (error) {
          return { ...result, error: `artist_insert: ${error.message}` };
        }
        result.created.artist = true;
      }
    }

    // 3. Insert communities row if missing.
    //    active=false until admin clicks "Mark setup complete" so a
    //    half-set-up community doesn't surface to fans yet.
    {
      const { data: existing } = await admin
        .from("communities")
        .select("slug")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) {
        const { error } = await admin.from("communities").insert({
          slug,
          display_name,
          active: false,
        });
        if (error) {
          return { ...result, error: `community_insert: ${error.message}` };
        }
        result.created.community = true;
      }
    }

    // 4. Seed default reward catalog if no rewards exist for this community
    {
      const { count } = await admin
        .from("rewards_catalog")
        .select("id", { count: "exact", head: true })
        .eq("community_id", slug);
      if (!count || count === 0) {
        const rows = DEFAULT_REWARDS.map((r) => ({
          ...r,
          community_id: slug,
          active: true,
          in_app_only: r.title === "Fan Spotlight",
        }));
        const { error } = await admin.from("rewards_catalog").insert(rows);
        if (error) {
          return { ...result, error: `rewards_seed: ${error.message}` };
        }
        result.created.rewards = rows.length;
      }
    }

    // 5. Insert pinned welcome announcement post if no announcement exists
    {
      const { data: existing } = await admin
        .from("community_posts")
        .select("id")
        .eq("artist_slug", slug)
        .eq("kind", "announcement")
        .limit(1)
        .maybeSingle();
      if (!existing) {
        const { error } = await admin.from("community_posts").insert({
          artist_slug: slug,
          author_id: KEVIN_FAN_ID,
          kind: "announcement",
          title: `Welcome to the ${display_name} fan community`,
          body:
            `You're in. This is where the ${display_name} fan family lives — first listens to new tracks, ` +
            `tour announcements, and exclusive perks just for fans who show up. Engage, earn points, redeem ` +
            `for early access and personal moments. Glad you're here.`,
          visibility: "public",
          pinned: true,
        });
        if (error) {
          return { ...result, error: `welcome_post: ${error.message}` };
        }
        result.created.welcomePost = true;
      }
    }

    return { ...result, ok: true, message: "Community initialized" };
  } catch (err) {
    return {
      ...result,
      error: err instanceof Error ? err.message : "unknown_error",
    };
  }
}
