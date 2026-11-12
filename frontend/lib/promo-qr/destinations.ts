/**
 * Public pages a staff member can point a promo QR at, for one community.
 *
 * Paths come from the existing helpers (community page, rewards, signup door).
 * Event rows contribute only the detail URL already stored on that event.
 * Check-in and any route this app does not serve are left out.
 */

import { communityPath, communitySignupHref } from "../community-default.ts";
import { parseArtistParam } from "../onboarding/artist-param.ts";
import { validatePromoUrl } from "./url.ts";

export interface PromoDestination {
  id: string;
  label: string;
  hint: string;
  url: string;
}

export interface PromoEventLink {
  id: string;
  title: string;
  url: string | null;
  active: boolean;
}

const MAX_EVENT_LINKS = 8;

function originOf(appUrl: string): string | null {
  const validated = validatePromoUrl(appUrl);
  if (!validated.ok) return null;
  const parsed = new URL(validated.url);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;
  if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
  return `${parsed.protocol}//${parsed.host}`;
}

function absolute(origin: string, pathAndQuery: string): string | null {
  if (!pathAndQuery.startsWith("/")) return null;
  const url = `${origin}${pathAndQuery}`;
  const validated = validatePromoUrl(url);
  return validated.ok ? validated.url : null;
}

function push(
  out: PromoDestination[],
  dest: { id: string; label: string; hint: string; url: string | null },
) {
  if (!dest.url) return;
  if (out.some((row) => row.url === dest.url)) return;
  out.push({ id: dest.id, label: dest.label, hint: dest.hint, url: dest.url });
}

/**
 * Canonical public links for `artistSlug` only. A slug that is not a
 * community/artist slug, or an app origin that is not a plain http(s)
 * origin, yields an empty list.
 */
export function buildPromoDestinations(input: {
  appUrl: string;
  artistSlug: string;
  artistName: string;
  events?: PromoEventLink[];
  merchUrl?: string | null;
}): PromoDestination[] {
  const slug = parseArtistParam(input.artistSlug);
  const origin = originOf(input.appUrl);
  if (!slug || !origin) return [];

  const name = input.artistName.trim() || slug;
  const pagePath = communityPath(slug);
  const out: PromoDestination[] = [];

  push(out, {
    id: "page",
    label: `${name} page`,
    hint: "Shows, follow, and events",
    url: absolute(origin, pagePath),
  });
  push(out, {
    id: "community",
    label: "Community",
    hint: "The fan community",
    url: absolute(origin, communityPath(slug, "community")),
  });
  push(out, {
    id: "signup",
    label: "Sign up",
    hint: "Join page for new fans",
    url: absolute(origin, communitySignupHref(slug, pagePath)),
  });
  push(out, {
    id: "rewards",
    label: "Rewards",
    hint: "Points and unlocks",
    url: absolute(origin, communityPath(slug, "rewards")),
  });
  push(out, {
    id: "founders",
    label: "Founding fans",
    hint: "Founder wall",
    url: absolute(origin, `${communityPath(slug)}/founders`),
  });

  const merch = validatePromoUrl(input.merchUrl ?? "");
  if (merch.ok) {
    push(out, {
      id: "merch",
      label: "Merch",
      hint: "The merch link on the artist page",
      url: merch.url,
    });
  }

  let eventCount = 0;
  for (const event of input.events ?? []) {
    if (eventCount >= MAX_EVENT_LINKS) break;
    if (!event.active) continue;
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(event.id)) continue;
    const link = validatePromoUrl(event.url ?? "");
    if (!link.ok) continue;
    const title = event.title.trim().replace(/\s+/g, " ").slice(0, 80) || "Event";
    push(out, {
      id: `event-${event.id}`,
      label: title,
      hint: "Details link saved on this event",
      url: link.url,
    });
    eventCount += 1;
  }

  return out;
}
