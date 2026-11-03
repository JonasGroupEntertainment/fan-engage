const GENERIC_ALT = "Challenge entry image";
const MAX_ALT = 120;

/**
 * Alt text for a challenge-entry photo.
 * `community_challenge_entries` has no `image_alt` column (0003: id, post_id,
 * fan_id, body, image_url, created_at). Use the entry body, or a generic label
 * when the fan did not write one.
 */
export function challengeEntryImageAlt(body: string | null | undefined): string {
  const trimmed = (body ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return GENERIC_ALT;
  if (trimmed.length <= MAX_ALT) return trimmed;
  return `${trimmed.slice(0, MAX_ALT - 1).trimEnd()}…`;
}
