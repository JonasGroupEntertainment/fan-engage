import { EASTERN_TIME_ZONE, easternDateString } from "../dates/eastern.ts";

/**
 * Which calendar day (Eastern, YYYY-MM-DD) an artist_events row happens on.
 *
 * `starts_at` / `ends_at` are real timestamps and win when present. Many
 * rows only carry the free-form `event_date` string an admin typed
 * ("Mar 14, 2026", "March 14 · 7 PM", "3/14/26", "Coming soon", "TBA").
 * This parses the common shapes and returns null for anything else — an
 * unparseable date is *not today*, never a guess. Shared by the Today row
 * ("Tonight: …", check-in eligibility).
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const pad = (n: number): string => String(n).padStart(2, "0");

function isValidDay(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Parse a free-form display date to YYYY-MM-DD. Year-less strings
 * ("Mar 14", "March 14 · 7 PM") take `fallbackYear` (the current year in
 * Eastern time). Returns null when nothing date-like is found.
 */
export function parseEventDateText(
  text: string | null | undefined,
  fallbackYear: number,
): string | null {
  if (!text) return null;
  const s = text.trim();
  if (!s) return null;

  // ISO: 2026-03-14 (optionally followed by anything)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isValidDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }

  // Numeric US: 3/14/2026, 03-14-26
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{4})\b/);
  if (m) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    const yRaw = Number(m[3]);
    const y = m[3].length === 2 ? 2000 + yRaw : yRaw;
    return isValidDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }

  // "Mar 14, 2026", "March 14 2026", "Sat, Mar 14 · 7 PM", "Mar. 14"
  m = s.match(
    /(?:^|\b)([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?!\d)/i,
  );
  if (m && MONTHS[m[1].toLowerCase()]) {
    const mo = MONTHS[m[1].toLowerCase()];
    const d = Number(m[2]);
    const y = m[3] ? Number(m[3]) : fallbackYear;
    return isValidDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }

  // "14 March 2026", "14 Mar"
  m = s.match(/(?:^|\b)(\d{1,2})\s+([a-z]{3,9})\.?(?:,?\s+(\d{4}))?\b/i);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const mo = MONTHS[m[2].toLowerCase()];
    const d = Number(m[1]);
    const y = m[3] ? Number(m[3]) : fallbackYear;
    return isValidDay(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }

  return null;
}

export interface EventDayInput {
  starts_at?: string | null;
  ends_at?: string | null;
  event_date?: string | null;
}

/** Eastern calendar day of `iso`, or null when it does not parse. */
function easternDayOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return easternDateString(new Date(t));
}

/**
 * The Eastern day the event happens on: `starts_at` first, then the
 * free-form `event_date`, else null. The free-form fallback uses the
 * current Eastern year for year-less strings.
 */
export function eventDayKey(e: EventDayInput, now: Date = new Date()): string | null {
  const fromStart = easternDayOf(e.starts_at);
  if (fromStart) return fromStart;
  const year = Number(
    now.toLocaleDateString("en-US", { timeZone: EASTERN_TIME_ZONE, year: "numeric" }),
  );
  return parseEventDateText(e.event_date, year);
}

/**
 * True when the event happens today (Eastern). Multi-day events count when
 * today falls between `starts_at` and `ends_at`.
 */
export function isEventToday(e: EventDayInput, now: Date = new Date()): boolean {
  const today = easternDateString(now);
  const start = easternDayOf(e.starts_at);
  const end = easternDayOf(e.ends_at);
  if (start && end) return start <= today && today <= end;
  return eventDayKey(e, now) === today;
}
