import { isMissingRsvpOpensColumn } from "@/lib/rsvp-window";

type PostgrestError = { code?: string; message?: string } | null;

/**
 * Select artist_events including `rsvp_opens_at` when migration 0079 is
 * present. If the column is not applied yet, retry without it so artist
 * pages keep rendering. Callers treat a missing value as "RSVP is open now".
 *
 * The column list is a runtime string, so the Supabase client cannot infer
 * a row type. Callers cast `data`.
 */
export async function selectWithOptionalRsvpOpens(
  run: (columns: string) => PromiseLike<{ data: unknown; error: PostgrestError }>,
  columns: string,
): Promise<{ data: unknown; error: PostgrestError }> {
  const withOpens = await run(`${columns}, rsvp_opens_at`);
  if (!isMissingRsvpOpensColumn(withOpens.error)) {
    return { data: withOpens.data, error: withOpens.error };
  }
  const plain = await run(columns);
  return { data: plain.data, error: plain.error };
}

/** Migration 0090 venue coordinate columns on artist_events. */
export const EVENT_GEO_COLUMNS = "city, region, lat, lng";

/**
 * True when a PostgREST error is about one of the 0090 geo columns being
 * absent ("column artist_events.lat does not exist", code 42703).
 */
export function isMissingEventGeoColumn(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return /\b(city|region|lat|lng)\b/i.test(msg) && /does not exist|could not find/i.test(msg);
}

/**
 * Select artist_events with the 0079 `rsvp_opens_at` column *and* the 0090
 * `city, region, lat, lng` columns, retrying without whichever is not
 * applied yet. Callers treat missing geo values as "no coordinates" (so no
 * distance is shown) and a missing `rsvp_opens_at` as "RSVP open now".
 */
export async function selectWithOptionalEventGeo(
  run: (columns: string) => PromiseLike<{ data: unknown; error: PostgrestError }>,
  columns: string,
): Promise<{ data: unknown; error: PostgrestError }> {
  const withGeo = await selectWithOptionalRsvpOpens(run, `${columns}, ${EVENT_GEO_COLUMNS}`);
  if (!isMissingEventGeoColumn(withGeo.error)) {
    return { data: withGeo.data, error: withGeo.error };
  }
  return selectWithOptionalRsvpOpens(run, columns);
}
