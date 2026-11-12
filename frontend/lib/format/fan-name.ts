/**
 * Compose a display name for a `fans` row.
 *
 * `public.fans` has NO `display_name` column on Fan Engage Pro — only
 * `first_name` / `last_name` (0001). Any PostgREST select that names
 * `fans(display_name)` is rejected outright and the whole query returns an
 * error, which is how the artist-portal dashboard showed "No fans yet" for a
 * community with 1,500+ members. Select the two name columns and run them
 * through this helper instead.
 */
export interface FanNameParts {
  first_name?: string | null;
  last_name?: string | null;
}

export const FAN_NAME_COLUMNS = "first_name, last_name" as const;

export function fanDisplayName(
  fan: FanNameParts | null | undefined,
  fallback = "A fan",
): string {
  const first = (fan?.first_name ?? "").trim();
  const last = (fan?.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || fallback;
}
