import { EASTERN_TIME_ZONE, easternDateString } from "../dates/eastern.ts";
import { normalizeRegion, resolveCityCoords } from "../geo/resolve.ts";

/**
 * Parse a pasted tour list — one show per line — into event rows for the
 * artist-portal bulk importer.
 *
 * Supported line shapes (separators: " — ", " – ", " - ", " | ", tab, " · ",
 * or plain commas):
 *
 *   Mar 14, 2026 — Ryman Auditorium — Nashville, TN — https://tix.example
 *   3/14/26 | Ryman Auditorium | Nashville, TN
 *   March 14 2026 Ryman Auditorium, Nashville TN
 *   2026-03-14<TAB>Ryman Auditorium<TAB>Nashville, TN<TAB>7:30 PM
 *   Sat Mar 14 · 7:30 PM · Ryman Auditorium · Nashville, TN
 *   Ryman Auditorium, Nashville, TN — Mar 14
 *
 * The date, time ("7:30 PM", "7pm", "19:30") and URL may appear anywhere
 * on the line. City/state is read from the END of what remains: "City, ST",
 * "City ST", "City, State Name". Whatever is left in front is the venue;
 * any further separated parts become `detail`.
 *
 * Year-less dates take the next occurrence (this Eastern year, or next
 * year when the day has already passed). Lines without a date or venue
 * are reported in `errors`, as are duplicates of an earlier (venue, date).
 * Nothing is guessed: an unparseable line is an error, not an event.
 */

export interface ParsedEvent {
  /** 1-based line number in the pasted text. */
  line: number;
  /** YYYY-MM-DD. */
  date: string;
  /** 24h "HH:MM" or null. */
  time: string | null;
  /** Venue name → artist_events.title. */
  venue: string;
  city: string | null;
  /** USPS code, upper case. */
  region: string | null;
  /** "City, ST" → artist_events.location. Null when no city/state parsed. */
  location: string | null;
  url: string | null;
  /** Leftover separated parts ("Members only", "w/ Dan Marshall"). */
  detail: string | null;
  /** Coordinates from the bundled US city table, when the city resolves. */
  lat: number | null;
  lng: number | null;
}

export interface ParseError {
  line: number;
  reason: string;
  raw: string;
}

export interface ParseTourListResult {
  rows: ParsedEvent[];
  errors: ParseError[];
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const WEEKDAY_RE =
  /^(?:mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|rsday|urday)?\.?,?$/i;

const pad = (n: number): string => String(n).padStart(2, "0");

function isValidDay(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

interface DateHit {
  y: number | null;
  m: number;
  d: number;
  start: number;
  end: number;
}

/**
 * Find the first date-like token in `s`. Returns the match span so the
 * caller can cut it out. Year may be missing (resolved by the caller).
 */
function findDate(s: string): DateHit | null {
  // ISO: 2026-03-14
  let m = s.match(/(^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  if (m && m.index !== undefined) {
    const start = m.index + m[1].length;
    return { y: Number(m[2]), m: Number(m[3]), d: Number(m[4]), start, end: m.index + m[0].length };
  }
  // Numeric US: 3/14/2026, 03-14-26, 3.14.26 — a year is required so a
  // bare "7:30" or "3/14" is not mistaken for a date.
  m = s.match(/(^|[^\d])(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})(?!\d)/);
  if (m && m.index !== undefined) {
    const start = m.index + m[1].length;
    const yRaw = Number(m[4]);
    return {
      y: m[4].length === 2 ? 2000 + yRaw : yRaw,
      m: Number(m[2]),
      d: Number(m[3]),
      start,
      end: m.index + m[0].length,
    };
  }
  // "Mar 14, 2026", "March 14 2026", "Mar. 14th", "Mar 14"
  m = s.match(/(^|[^a-z])([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?![\d:])/i);
  if (m && m.index !== undefined && MONTHS[m[2].toLowerCase()]) {
    const start = m.index + m[1].length;
    return { y: m[4] ? Number(m[4]) : null, m: MONTHS[m[2].toLowerCase()], d: Number(m[3]), start, end: m.index + m[0].length };
  }
  // "14 March 2026", "14 Mar"
  m = s.match(/(^|[^\d])(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:,?\s+(\d{4}))?(?![a-z])/i);
  if (m && m.index !== undefined && MONTHS[m[3].toLowerCase()]) {
    const start = m.index + m[1].length;
    return { y: m[4] ? Number(m[4]) : null, m: MONTHS[m[3].toLowerCase()], d: Number(m[2]), start, end: m.index + m[0].length };
  }
  return null;
}

interface TimeHit {
  time: string;
  start: number;
  end: number;
}

/** "7:30 PM", "7pm", "7 p.m.", "19:30", "Doors 7:30PM" → 24h HH:MM. */
function findTime(s: string): TimeHit | null {
  let m = s.match(/(^|[^\d:])(?:(?:doors?|show(?:time)?|time)\s*(?:at|@)?\s*:?\s*)?(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?(?![a-z])/i);
  if (m && m.index !== undefined) {
    let h = Number(m[2]);
    const min = m[3] ?? "00";
    if (h >= 1 && h <= 12 && Number(min) < 60) {
      const pm = m[4].toLowerCase() === "p";
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
      const start = m.index + m[1].length;
      return { time: `${pad(h)}:${min}`, start, end: m.index + m[0].length };
    }
  }
  m = s.match(/(^|[^\d:\/.-])(?:(?:doors?|show(?:time)?|time)\s*(?:at|@)?\s*:?\s*)?(\d{1,2}):(\d{2})(?![\d:\/.-])/i);
  if (m && m.index !== undefined) {
    const h = Number(m[2]);
    const min = Number(m[3]);
    if (h <= 23 && min <= 59) {
      const start = m.index + m[1].length;
      return { time: `${pad(h)}:${m[3]}`, start, end: m.index + m[0].length };
    }
  }
  return null;
}

function cut(s: string, start: number, end: number): string {
  return `${s.slice(0, start)} ${s.slice(end)}`;
}

/** Split on the strong separators; fall back to commas when there are none. */
function splitParts(s: string): string[] {
  const strong = s.split(/\t|\s+[—–|·•]\s+|\s+-\s+|\s*[|\t]\s*/).map((p) => p.trim()).filter(Boolean);
  const parts = strong.length > 1 ? strong : s.split(",").map((p) => p.trim()).filter(Boolean);
  return parts
    .map((p) => p.replace(/^[,;:\s—–·•|-]+|[,;:\s—–·•|-]+$/g, "").trim())
    .filter((p) => p && !WEEKDAY_RE.test(p) && !/^(doors?|show|showtime|time)\s*:?$/i.test(p));
}

/** Current year in Eastern time for `now`. */
function easternYear(now: Date): number {
  return Number(now.toLocaleDateString("en-US", { timeZone: EASTERN_TIME_ZONE, year: "numeric" }));
}

interface CityHit {
  city: string;
  region: string;
}

/**
 * Pull "City, ST" / "City ST" / "City, State Name" off the end of the
 * remaining parts. Mutates `parts` (removes what it consumed) and returns
 * the hit, or null when the tail is not a US place.
 */
function takeCity(parts: string[]): CityHit | null {
  // Scan from the end: the place is usually last, but a trailing note
  // ("Members only") may follow it. Index 0 is reserved for the venue
  // unless it is the only part.
  for (let i = parts.length - 1; i >= 0; i--) {
    if (i === 0 && parts.length > 1) break;
    const hit = takeCityAt(parts, i);
    if (hit) return hit;
  }
  return null;
}

function takeCityAt(parts: string[], i: number): CityHit | null {
  const last = parts[i];

  // Part is just a state ("TN" / "Tennessee") → city is the part before.
  const lastRegion = normalizeRegion(last.replace(/\.$/, ""));
  if (lastRegion && (last.length > 2 || last === last.toUpperCase()) && i >= 1) {
    const city = parts[i - 1].replace(/,+$/, "").trim();
    // Guard: that part must look like a city, not the venue + city mashed
    // together without a comma ("Ryman Auditorium Nashville TN").
    const inner = splitVenueCity(city, lastRegion);
    parts.splice(i - 1, 2);
    if (inner) {
      if (inner.venue) parts.splice(i - 1, 0, inner.venue);
      return { city: inner.city, region: lastRegion.toUpperCase() };
    }
    return { city, region: lastRegion.toUpperCase() };
  }

  // "Nashville, TN" / "Nashville TN" / "Nashville, Tennessee" in one part.
  const comma = last.lastIndexOf(",");
  if (comma > 0) {
    const region = normalizeRegion(last.slice(comma + 1).replace(/\.$/, ""));
    if (!region) return null;
    const city = last.slice(0, comma).trim();
    parts.splice(i, 1);
    const inner = splitVenueCity(city, region);
    if (inner) {
      if (inner.venue) parts.splice(i, 0, inner.venue);
      return { city: inner.city, region: region.toUpperCase() };
    }
    return { city, region: region.toUpperCase() };
  }
  const tokens = last.split(/\s+/);
  for (const n of [1, 2]) {
    if (tokens.length <= n) break;
    const tail = tokens.slice(-n).join(" ").replace(/\.$/, "");
    const region = normalizeRegion(tail);
    // A bare two-letter tail must be upper case ("Nashville TN", not
    // "Fillmore in").
    if (!region || (tail.length === 2 && tail !== tail.toUpperCase())) continue;
    const city = tokens.slice(0, -n).join(" ");
    parts.splice(i, 1);
    const inner = splitVenueCity(city, region);
    if (inner) {
      if (inner.venue) parts.splice(i, 0, inner.venue);
      return { city: inner.city, region: region.toUpperCase() };
    }
    return { city, region: region.toUpperCase() };
  }
  return null;
}

/**
 * "Ryman Auditorium Nashville" + "tn" → { venue: "Ryman Auditorium",
 * city: "Nashville" } when the trailing 1–3 words are a city the table
 * knows in that state. Null when the whole string is the city (or nothing
 * resolves — the caller keeps the text as the city).
 */
function splitVenueCity(text: string, region: string): { venue: string; city: string } | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return null;
  if (resolveCityCoords(text, region)) return null;
  for (const n of [1, 2, 3]) {
    if (tokens.length <= n) break;
    const city = tokens.slice(-n).join(" ");
    if (resolveCityCoords(city, region)) {
      return { venue: tokens.slice(0, -n).join(" ").replace(/[,—–-]+$/, "").trim(), city };
    }
  }
  return null;
}

export function parseTourList(text: string, now: Date = new Date()): ParseTourListResult {
  const rows: ParsedEvent[] = [];
  const errors: ParseError[] = [];
  const seen = new Map<string, number>();
  const today = easternDateString(now);
  const thisYear = easternYear(now);

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  lines.forEach((rawLine, i) => {
    const line = i + 1;
    const raw = rawLine.trim();
    if (!raw) return;
    if (/^#/.test(raw)) return; // comment line
    let s = ` ${raw} `;

    // URL anywhere.
    let url: string | null = null;
    const u = s.match(/https?:\/\/[^\s|]+|\bwww\.[^\s|]+/i);
    if (u && u.index !== undefined) {
      url = u[0].replace(/[),.;]+$/, "");
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      s = cut(s, u.index, u.index + u[0].length);
    }

    // Date.
    const d = findDate(s);
    if (!d) {
      errors.push({ line, reason: "No date found", raw });
      return;
    }
    s = cut(s, d.start, d.end);

    // Time (after the date is removed so "3/14/26" cannot read as 3:14).
    let time: string | null = null;
    const t = findTime(s);
    if (t) {
      time = t.time;
      s = cut(s, t.start, t.end);
    }

    // Year: given, else next occurrence.
    let year = d.y;
    if (year === null) {
      year = thisYear;
      if (isValidDay(year, d.m, d.d) && `${year}-${pad(d.m)}-${pad(d.d)}` < today) year += 1;
    }
    if (!isValidDay(year, d.m, d.d)) {
      errors.push({ line, reason: `Invalid date ${d.m}/${d.d}/${year}`, raw });
      return;
    }
    const date = `${year}-${pad(d.m)}-${pad(d.d)}`;

    const parts = splitParts(s);
    const place = takeCity(parts);
    const venue = parts.shift() ?? "";
    if (!venue) {
      errors.push({ line, reason: "No venue found", raw });
      return;
    }

    const key = `${venue.toLowerCase()}|${date}`;
    const dup = seen.get(key);
    if (dup !== undefined) {
      errors.push({ line, reason: `Duplicate of line ${dup} (${venue}, ${date})`, raw });
      return;
    }
    seen.set(key, line);

    const resolved = place ? resolveCityCoords(place.city, place.region) : null;
    rows.push({
      line,
      date,
      time,
      venue,
      city: place?.city ?? null,
      region: place?.region ?? null,
      location: place ? `${place.city}, ${place.region}` : null,
      url,
      detail: parts.length ? parts.join(" · ") : null,
      lat: resolved?.lat ?? null,
      lng: resolved?.lng ?? null,
    });
  });

  return { rows, errors };
}
