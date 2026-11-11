/**
 * Helpers for <input type="datetime-local">.
 *
 * That input gives "YYYY-MM-DDTHH:mm" with no zone. Sent to Postgres as-is,
 * a timestamptz column reads it as UTC, so "7:30 PM" typed by someone in
 * Nashville was stored as 7:30 PM UTC (1:30 or 2:30 PM their time).
 *
 * These run in the browser, where `new Date("YYYY-MM-DDTHH:mm")` uses the
 * person's own zone. The form converts to a full ISO instant before the
 * server action runs, so the server never has to guess a zone.
 *
 * Pure: no React, no `@/` imports, so node tests can load it.
 */

/** A datetime-local value: date, "T", time, and no zone suffix. */
const ZONELESS_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * datetime-local value → ISO instant, read in the runtime's local zone.
 * Blank → "". A value that already has a zone, or is not a date, is
 * returned unchanged so the server action can store or reject it.
 */
export function localInputToIso(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (!ZONELESS_LOCAL.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

/** Stored ISO instant → the "YYYY-MM-DDTHH:mm" a datetime-local input shows, in the local zone. */
export function isoToLocalInput(iso: string | null | undefined): string {
  const raw = (iso ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Copy of `formData` with the named datetime-local fields converted to ISO
 * instants. The original is left alone. Fields the form does not have are
 * skipped.
 */
export function withLocalDateTimesAsIso(
  formData: FormData,
  fieldNames: readonly string[],
): FormData {
  const names = new Set(fieldNames);
  const copy = new FormData();
  for (const [key, value] of formData.entries()) {
    if (names.has(key) && typeof value === "string") {
      copy.append(key, localInputToIso(value));
    } else {
      copy.append(key, value);
    }
  }
  return copy;
}

/** True for an IANA zone name this runtime knows ("America/Chicago"). */
export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** How far `timeZone` is ahead of UTC at `instantMs`, in ms (negative in the Americas). */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const wallAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return wallAsUtc - Math.floor(instantMs / 1000) * 1000;
}

const ZONELESS_MINUTES = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * "YYYY-MM-DDTHH:mm" read as wall-clock time in `timeZone` → ISO instant.
 *
 * For server code, which cannot use the browser's zone: the client sends
 * its zone name and the server converts. Null when the value is not a
 * zoneless date and time, the date does not exist, or the zone is unknown.
 */
export function zonedLocalToIso(local: string, timeZone: string): string | null {
  const m = ZONELESS_MINUTES.exec((local ?? "").trim());
  if (!m || !isValidTimeZone(timeZone)) return null;
  const [year, month, day, hour, minute] = m.slice(1).map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wallAsUtc);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) {
    return null;
  }
  // Offset at the first guess, then once more in case the guess landed on
  // the other side of a daylight-saving change.
  const firstGuess = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  const instant = wallAsUtc - zoneOffsetMs(firstGuess, timeZone);
  return new Date(instant).toISOString();
}
