/**
 * Great-circle distance between two WGS84 points, in statute miles.
 *
 * Plain haversine on a spherical Earth (mean radius 3,958.8 mi). Accurate to
 * well under 0.5% for the "how far is this show from home" question, which
 * is all the product needs — no PostGIS, no ellipsoid.
 */

export const EARTH_RADIUS_MILES = 3958.8;

export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True when both coordinates are finite numbers (null/undefined/NaN fail). */
export function hasCoords(
  p: { lat: number | null | undefined; lng: number | null | undefined },
): p is LatLng {
  return (
    typeof p.lat === "number" &&
    typeof p.lng === "number" &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng)
  );
}

/**
 * Distance in whole miles between a fan's home and an event venue, or null
 * when either side has no coordinates. Never guesses from a city string.
 */
export function distanceMilesBetween(
  fan: { lat: number | null | undefined; lng: number | null | undefined },
  venue: { lat: number | null | undefined; lng: number | null | undefined },
): number | null {
  if (!hasCoords(fan) || !hasCoords(venue)) return null;
  return Math.round(haversineMiles(fan, venue));
}
