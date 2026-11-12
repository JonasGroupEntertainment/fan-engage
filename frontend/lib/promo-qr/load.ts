/**
 * Suggested promo destinations for one community slug.
 *
 * Callers must already have authorized that slug. This reads the artist
 * name, merch link, and event detail links already stored for that slug.
 * It does not accept or fetch a staff-entered URL.
 */

import { APP_URL } from "../app-url.ts";
import { listEventsForAdmin } from "../data/artists.ts";
import { parseArtistParam } from "../onboarding/artist-param.ts";
import { createAdminClient } from "../supabase/admin.ts";
import { buildPromoDestinations, type PromoDestination, type PromoEventLink } from "./destinations.ts";

async function loadArtistProfile(
  slug: string,
): Promise<{ artistName: string; merchUrl: string | null }> {
  try {
    const admin = createAdminClient();
    const [{ data: artist }, { data: community }] = await Promise.all([
      admin.from("artists").select("name, merch_url").eq("slug", slug).maybeSingle(),
      admin.from("communities").select("display_name").eq("slug", slug).maybeSingle(),
    ]);
    const name = typeof artist?.name === "string" ? artist.name.trim() : "";
    const display =
      typeof community?.display_name === "string" ? community.display_name.trim() : "";
    return {
      artistName: name || display || slug,
      merchUrl: typeof artist?.merch_url === "string" ? artist.merch_url : null,
    };
  } catch (err) {
    console.warn(
      "loadPromoQrContext: artist lookup failed",
      err instanceof Error ? err.message : err,
    );
    return { artistName: slug, merchUrl: null };
  }
}

async function loadEventLinks(slug: string): Promise<PromoEventLink[]> {
  try {
    const rows = await listEventsForAdmin(slug);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      active: row.active,
    }));
  } catch (err) {
    console.warn(
      "loadPromoQrContext: event lookup failed",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

export interface PromoQrContext {
  artistSlug: string;
  artistName: string;
  destinations: PromoDestination[];
}

export async function loadPromoQrContext(artistSlug: string): Promise<PromoQrContext> {
  const slug = parseArtistParam(artistSlug);
  if (!slug) return { artistSlug: "", artistName: "", destinations: [] };

  const [profile, events] = await Promise.all([loadArtistProfile(slug), loadEventLinks(slug)]);
  const artistName = profile.artistName;
  const merchUrl = profile.merchUrl;

  return {
    artistSlug: slug,
    artistName,
    destinations: buildPromoDestinations({
      appUrl: APP_URL,
      artistSlug: slug,
      artistName,
      merchUrl,
      events,
    }),
  };
}
