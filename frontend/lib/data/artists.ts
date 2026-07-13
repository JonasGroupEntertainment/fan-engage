import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ARTISTS as FALLBACK_ARTISTS, type Artist } from "@/lib/artists";

export type { Artist } from "@/lib/artists";

export interface ArtistEvent {
  id: string;
  artist_slug: string;
  title: string;
  detail: string | null;
  event_date: string | null;
  url: string | null;
  location: string | null;
  image_url: string | null;
  capacity: number | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  active: boolean;
  /** Access tier from migration 0015: 'public' (default) | 'premium'. */
  tier: "public" | "premium";
}

type ArtistRow = {
  slug: string;
  name: string;
  tagline: string | null;
  bio: string | null;
  hero_image: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  accent_from: string;
  accent_to: string;
  genres: string[] | null;
  social: Array<{ label: string; href: string }> | null;
  active: boolean;
  sort_order: number;
  merch_url: string | null;
};

/**
 * An event is past once its end (or start, when no end is set) is behind us.
 * Events with only a free-form `event_date` string can't be judged, so they
 * stay visible until an admin deactivates them or sets timestamps.
 */
function isPastEvent(e: ArtistEvent, now: number): boolean {
  const ts = e.ends_at ?? e.starts_at;
  if (!ts) return false;
  const t = Date.parse(ts);
  return Number.isFinite(t) && t < now;
}

function rowToArtist(row: ArtistRow, events: ArtistEvent[]): Artist {
  // Preserve the legacy Artist shape (merch still comes from the fallback
  // for now; future phase moves merch to DB-backed offers-per-artist).
  const fallback = FALLBACK_ARTISTS[row.slug];
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline ?? "",
    bio: row.bio ?? "",
    heroImage: row.hero_image,
    heroFocalX: row.hero_focal_x ?? undefined,
    heroFocalY: row.hero_focal_y ?? undefined,
    accentFrom: row.accent_from,
    accentTo: row.accent_to,
    genres: row.genres ?? [],
    social: row.social ?? [],
    upcoming: events
      .filter((e) => e.active && !isPastEvent(e, Date.now()))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((e) => ({
        id: e.id,
        title: e.title,
        detail: e.detail ?? "",
        date: e.event_date ?? "",
        capacity: e.capacity ?? null,
        location: e.location ?? null,
        url: e.url ?? null,
        tier: (e.tier ?? "public") as "public" | "premium",
      })),
    merch: fallback?.merch ?? [],
    merchUrl: row.merch_url ?? null,
  };
}

/**
 * Fetch a single artist with their active events. Falls back to the
 * hardcoded ARTISTS map when Supabase is unreachable or the row is missing
 * — so dev previews without DB creds still render.
 */
export async function getArtistFromDb(slug: string): Promise<Artist | null> {
  try {
    const supabase = await createClient();
    const normalized = slug.toLowerCase();

    const [{ data: artist, error: aErr }, { data: events, error: eErr }] = await Promise.all([
      supabase
        .from("artists")
        .select("slug, name, tagline, bio, hero_image, hero_focal_x, hero_focal_y, accent_from, accent_to, genres, social, active, sort_order, merch_url")
        .eq("slug", normalized)
        .eq("active", true)
        .maybeSingle(),
      supabase
        .from("artist_events")
        .select("id, artist_slug, title, detail, event_date, url, location, image_url, capacity, starts_at, ends_at, sort_order, active, tier")
        .eq("artist_slug", normalized)
        .eq("active", true)
        .order("sort_order"),
    ]);

    if (aErr || eErr || !artist) {
      return FALLBACK_ARTISTS[normalized] ?? null;
    }
    return rowToArtist(artist as ArtistRow, (events ?? []) as ArtistEvent[]);
  } catch {
    return FALLBACK_ARTISTS[slug.toLowerCase()] ?? null;
  }
}

/** List every active artist with their events. */
export async function listArtistsFromDb(): Promise<Artist[]> {
  try {
    const supabase = await createClient();
    const { data: artists, error } = await supabase
      .from("artists")
      .select("slug, name, tagline, bio, hero_image, hero_focal_x, hero_focal_y, accent_from, accent_to, genres, social, active, sort_order, merch_url")
      .eq("active", true)
      .order("sort_order");
    if (error || !artists || artists.length === 0) {
      return Object.values(FALLBACK_ARTISTS);
    }

    const slugs = artists.map((a) => a.slug as string);
    const { data: events } = await supabase
      .from("artist_events")
      .select("id, artist_slug, title, detail, event_date, url, location, image_url, capacity, starts_at, ends_at, sort_order, active, tier")
      .in("artist_slug", slugs)
      .eq("active", true)
      .order("sort_order");

    const byArtist = new Map<string, ArtistEvent[]>();
    for (const e of events ?? []) {
      const arr = byArtist.get(e.artist_slug as string) ?? [];
      arr.push(e as ArtistEvent);
      byArtist.set(e.artist_slug as string, arr);
    }

    return (artists as ArtistRow[]).map((a) =>
      rowToArtist(a, byArtist.get(a.slug) ?? []),
    );
  } catch {
    return Object.values(FALLBACK_ARTISTS);
  }
}

/**
 * Admin-scoped variant — uses service role so drafts / inactive artists are
 * visible. Use only from /admin/* server components or server actions.
 */
export async function listArtistsForAdmin(): Promise<
  Array<ArtistRow & { event_count: number; follower_count: number }>
> {
  const admin = createAdminClient();
  const [{ data: artists }, { data: events }, { data: follows }] = await Promise.all([
    admin
      .from("artists")
      .select("slug, name, tagline, bio, hero_image, hero_focal_x, hero_focal_y, accent_from, accent_to, genres, social, active, sort_order, merch_url")
      .order("sort_order"),
    admin.from("artist_events").select("artist_slug"),
    admin.from("fan_artist_following").select("artist_slug"),
  ]);

  const eventCounts = new Map<string, number>();
  for (const e of events ?? []) {
    eventCounts.set(e.artist_slug as string, (eventCounts.get(e.artist_slug as string) ?? 0) + 1);
  }
  const followCounts = new Map<string, number>();
  for (const f of follows ?? []) {
    followCounts.set(f.artist_slug as string, (followCounts.get(f.artist_slug as string) ?? 0) + 1);
  }

  return (artists ?? []).map((a) => ({
    ...(a as ArtistRow),
    event_count: eventCounts.get(a.slug as string) ?? 0,
    follower_count: followCounts.get(a.slug as string) ?? 0,
  }));
}

/** Admin-scoped: events for a single artist, including inactive. */
export async function listEventsForAdmin(slug: string): Promise<ArtistEvent[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("artist_events")
    .select("id, artist_slug, title, detail, event_date, url, location, image_url, capacity, starts_at, ends_at, sort_order, active")
    .eq("artist_slug", slug)
    .order("sort_order");
  return (data ?? []) as ArtistEvent[];
}

/** Returns true if the signed-in fan follows the given artist. */
export async function doesFanFollowArtist(artistSlug: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("fan_artist_following")
      .select("artist_slug")
      .eq("fan_id", user.id)
      .eq("artist_slug", artistSlug)
      .maybeSingle();
    return data !== null;
  } catch {
    return false;
  }
}
