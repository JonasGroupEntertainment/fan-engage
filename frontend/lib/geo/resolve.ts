import { US_CITIES, US_STATE_CODES, US_STATE_NAMES } from "./us-cities.ts";

export interface ResolvedCity {
  lat: number;
  lng: number;
  /** Canonical `city|st` key that matched, e.g. "austin|tx". */
  key: string;
  city: string;
  region: string;
}

/**
 * Normalise a free-text region: "TX", "tx", "Texas", " Tex. " → "tx".
 * Returns null when it is not a recognised US state / DC.
 */
export function normalizeRegion(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (!s) return null;
  if (US_STATE_CODES.has(s)) return s;
  if (US_STATE_NAMES[s]) return US_STATE_NAMES[s];
  return null;
}

/**
 * Normalise a free-text city for table lookup. Lower case, punctuation
 * trimmed, whitespace collapsed, and the usual abbreviation drift folded:
 * "Saint Louis" / "St Louis" / "ST. LOUIS" → "st. louis", "Ft. Worth" →
 * "fort worth", "Mt. Juliet" → "mount juliet".
 */
export function normalizeCity(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/[’'"`()]/g, ""); // quotes/parens never matter
  s = s.replace(/\s+/g, " ");
  // Fold "saint x" / "st x" / "st. x" to the table's "st. x".
  s = s.replace(/^(saint|st\.?)\s+/, "st. ");
  s = s.replace(/^(fort|ft\.?)\s+/, "fort ");
  s = s.replace(/^(mount|mt\.?)\s+/, "mount ");
  s = s.replace(/\s*-\s*/g, "-"); // "winston - salem" → "winston-salem"
  s = s.replace(/[.,;:]+$/g, "");
  return s.trim();
}

/**
 * Split a city string that may carry its own state: "Austin, TX",
 * "Austin TX", "Greenville, Texas", "Nashville, TN 37203". When the tail
 * is a recognised state it is returned as `region`; otherwise the whole
 * string is the city.
 */
export function splitCityAndRegion(input: string): { city: string; region: string | null } {
  const raw = input.trim().replace(/\s+/g, " ");
  // Drop a trailing ZIP (5 or 5+4) and a trailing "USA"/"US".
  const noZip = raw
    .replace(/,?\s*\b\d{5}(?:-\d{4})?\b\s*$/, "")
    .replace(/,?\s*\b(usa|us|united states)\b\s*$/i, "")
    .trim();
  const comma = noZip.lastIndexOf(",");
  if (comma >= 0) {
    const region = normalizeRegion(noZip.slice(comma + 1));
    if (region) return { city: noZip.slice(0, comma), region };
    return { city: noZip, region: null };
  }
  // No comma: try the last token ("Austin TX") then the last two ("Greenville New York").
  const tokens = noZip.split(" ");
  for (const n of [1, 2]) {
    if (tokens.length > n) {
      const region = normalizeRegion(tokens.slice(-n).join(" "));
      if (region) return { city: tokens.slice(0, -n).join(" "), region };
    }
  }
  return { city: noZip, region: null };
}

function lookup(cityKey: string, region: string): ResolvedCity | null {
  const key = `${cityKey}|${region}`;
  const hit = US_CITIES[key];
  if (!hit) return null;
  return { lat: hit[0], lng: hit[1], key, city: cityKey, region };
}

/**
 * Resolve a city + region to coordinates from the bundled table.
 *
 * - `region` may be a USPS code or a full state name; when blank, a state
 *   embedded in `city` ("Austin, TX") is used instead.
 * - Without any region, the city resolves only when its name is unique in
 *   the table ("nashville" → TN); ambiguous names ("columbus", "portland")
 *   return null rather than guessing.
 * - Returns null when nothing matches. Callers show "(unresolved — add
 *   coordinates)" and leave lat/lng empty; never store a guess.
 */
export function resolveCityCoords(
  city: string | null | undefined,
  region?: string | null,
): ResolvedCity | null {
  if (!city || !city.trim()) return null;
  const split = splitCityAndRegion(city);
  const cityKey = normalizeCity(split.city);
  if (!cityKey) return null;
  // An explicit region that is not a US state is a hard miss — never fall
  // through to a unique-name guess for "Austin, Ontario".
  if (region && region.trim() && !normalizeRegion(region)) return null;
  const regionKey = normalizeRegion(region) ?? split.region;

  const candidates = [cityKey, cityKey.replace(/-/g, " "), cityKey.replace(/ /g, "-")];
  if (regionKey) {
    for (const c of candidates) {
      const hit = lookup(c, regionKey);
      if (hit) return hit;
    }
    return null;
  }

  // No region anywhere: accept only a unique city-name match.
  const matches: ResolvedCity[] = [];
  for (const key of Object.keys(US_CITIES)) {
    const [name, st] = key.split("|");
    if (candidates.includes(name)) {
      const hit = lookup(name, st);
      if (hit) matches.push(hit);
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

/** Number of city rows in the bundled table (for admin copy / tests). */
export const US_CITY_COUNT = Object.keys(US_CITIES).length;
