import { resolveCityCoords } from "../geo/resolve.ts";

/**
 * Pure builders for `artist_events` rows, shared by the admin event forms
 * (app/admin/artists/actions.ts), the artist-portal event forms and the
 * tour-list bulk importer. One place decides how a row's text fields are
 * normalised so the three writers never drift.
 *
 * Column conventions (0006 + 0011 + 0090):
 *   event_date  — free-form display string an admin typed ("Mar 14, 2026",
 *                 "Mar 14 · 7 PM"). Parsed by lib/today/event-day.ts.
 *   starts_at   — timestamptz. The forms submit a `datetime-local` value
 *                 ("2026-03-14T19:30", no zone) and the DB stores it as-is.
 *   location    — free-form venue / city text shown to fans.
 *   city/region/lat/lng — 0090 venue coordinates for "near me".
 */

export interface EventRowInput {
  title: string;
  detail?: string | null;
  /** Free-form display date, stored verbatim (empty → null). */
  eventDate?: string | null;
  /** `datetime-local` string or ISO timestamp (empty → null). */
  startsAt?: string | null;
  location?: string | null;
  url?: string | null;
  /** Already-parsed capacity; NaN / undefined / null → null. */
  capacity?: number | null;
  sortOrder?: number | null;
}

export interface EventRow {
  title: string;
  detail: string | null;
  event_date: string | null;
  starts_at: string | null;
  location: string | null;
  url: string | null;
  capacity: number | null;
  sort_order: number;
}

const text = (v: string | null | undefined): string | null => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

/** Normalise the text columns of an artist_events row exactly as the admin form does. */
export function buildEventRow(input: EventRowInput): EventRow {
  const capacity =
    typeof input.capacity === "number" && Number.isFinite(input.capacity)
      ? input.capacity
      : null;
  const sortOrder =
    typeof input.sortOrder === "number" && Number.isFinite(input.sortOrder)
      ? input.sortOrder
      : 0;
  return {
    title: input.title.trim(),
    detail: text(input.detail),
    event_date: text(input.eventDate),
    starts_at: text(input.startsAt),
    location: text(input.location),
    url: text(input.url),
    capacity,
    sort_order: sortOrder,
  };
}

export interface EventGeoInput {
  city?: string | null;
  region?: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
}

export interface EventGeo {
  city: string | null;
  region: string | null;
  lat: number | null;
  lng: number | null;
}

/**
 * 0090 venue location. City + region are stored as typed (region
 * upper-cased); lat/lng are used when both are finite, else resolved from
 * the bundled US city table. Unresolvable cities store null coordinates
 * and the admin row shows "(unresolved — add coordinates)".
 */
export function resolveEventGeo(input: EventGeoInput): EventGeo {
  const city = (input.city ?? "").trim();
  const region = (input.region ?? "").trim().toUpperCase();
  const num = (v: number | string | null | undefined): number | null => {
    if (v === null || v === undefined) return null;
    const s = typeof v === "string" ? v.trim() : v;
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };
  let lat = num(input.lat);
  let lng = num(input.lng);
  if ((lat === null || lng === null) && city) {
    const resolved = resolveCityCoords(city, region || null);
    if (resolved) {
      lat = resolved.lat;
      lng = resolved.lng;
    } else {
      lat = null;
      lng = null;
    }
  }
  return { city: city || null, region: region || null, lat, lng };
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Display date in the admin placeholder style — "Mar 14, 2026" or
 * "Mar 14, 2026 · 7:30 PM" — from an ISO day and optional 24h "HH:MM".
 * Round-trips through parseEventDateText (lib/today/event-day.ts).
 */
export function formatEventDisplayDate(isoDate: string, time?: string | null): string {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  const month = MONTH_ABBR[Number(m[2]) - 1] ?? m[2];
  const day = Number(m[3]);
  let out = `${month} ${day}, ${m[1]}`;
  if (time) {
    const t = time.match(/^(\d{2}):(\d{2})$/);
    if (t) {
      const h24 = Number(t[1]);
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const ampm = h24 < 12 ? "AM" : "PM";
      out += ` · ${h12}${t[2] === "00" ? "" : `:${t[2]}`} ${ampm}`;
    }
  }
  return out;
}

/**
 * `starts_at` value in the same shape the forms submit (`datetime-local`,
 * "YYYY-MM-DDTHH:MM"). Null when no time is known — the forms leave
 * starts_at empty too, and event_date carries the day for display and
 * for lib/today/event-day.ts.
 */
export function buildStartsAt(isoDate: string, time?: string | null): string | null {
  if (!time || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  return `${isoDate}T${time}`;
}
