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
