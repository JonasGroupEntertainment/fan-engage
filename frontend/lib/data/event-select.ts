import { isMissingRsvpOpensColumn } from "@/lib/rsvp-window";

type PostgrestError = { code?: string; message?: string } | null;

/**
 * Select artist_events including `rsvp_opens_at` when migration 0078 is
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
