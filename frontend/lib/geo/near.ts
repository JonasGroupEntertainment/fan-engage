import { distanceMilesBetween } from "./haversine.ts";

/** Under this many miles an event gets the "Near you" badge. */
export const NEAR_YOU_MILES = 75;

export interface Coords {
  lat: number | null | undefined;
  lng: number | null | undefined;
}

export interface EventDistance {
  /** Whole miles from the fan's home to the venue, or null when either side has no coordinates. */
  distanceMiles: number | null;
  /** True only when a distance exists and is under NEAR_YOU_MILES. */
  nearYou: boolean;
}

/**
 * Distance + "near you" for one event. Never shows a distance when either
 * the fan's home or the venue lacks coordinates — a missing side is null,
 * not zero.
 */
export function eventDistance(fanHome: Coords | null | undefined, venue: Coords): EventDistance {
  if (!fanHome) return { distanceMiles: null, nearYou: false };
  const distanceMiles = distanceMilesBetween(fanHome, venue);
  return { distanceMiles, nearYou: distanceMiles !== null && distanceMiles < NEAR_YOU_MILES };
}

/** Fan row → home coordinates, or null when the fan has not set a resolvable home city. */
export function fanHomeCoords(
  fan: { home_lat?: number | null; home_lng?: number | null } | null | undefined,
): Coords | null {
  if (!fan) return null;
  if (typeof fan.home_lat !== "number" || typeof fan.home_lng !== "number") return null;
  return { lat: fan.home_lat, lng: fan.home_lng };
}
