import { safeAppPath } from "./safe-app-path.ts";
import { ARTIST_PARAM, parseArtistParam } from "./onboarding/artist-param.ts";

/**
 * Preserve artist and destination when switching login -> signup -> onboarding.
 *
 * `ref` is the legacy artist-page attribution (and the fan invite code on
 * older links); `artist` is the explicit artist pick (`?artist=<slug>`), which
 * survives a nested `/onboarding?artist=…` next as well as a top-level param.
 */
export function signupOnboardingHref(
  rawNext: string | null,
  ref: string | null,
  artist: string | null = null,
): string {
  const next = safeAppPath(rawNext);
  const params = new URLSearchParams();
  if (next) {
    const url = new URL(next, "https://fan-engage.invalid");
    if (url.pathname === "/onboarding") {
      const nestedRef = url.searchParams.get("ref");
      const nestedArtist = parseArtistParam(url.searchParams.get(ARTIST_PARAM));
      const nestedNext = safeAppPath(url.searchParams.get("next"));
      if (nestedRef) params.set("ref", nestedRef);
      if (nestedArtist) params.set(ARTIST_PARAM, nestedArtist);
      if (nestedNext && new URL(nestedNext, url.origin).pathname !== "/onboarding") {
        params.set("next", nestedNext);
      }
    } else {
      params.set("next", next);
    }
  }
  if (ref) params.set("ref", ref);
  const explicitArtist = parseArtistParam(artist);
  if (explicitArtist) params.set(ARTIST_PARAM, explicitArtist);
  params.sort();
  const query = params.toString();
  return query ? `/onboarding?${query}` : "/onboarding";
}
