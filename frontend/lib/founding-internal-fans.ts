/**
 * Staff, team, and internal test accounts excluded from the public
 * Founding Fan wall and from the 100-spot counter.
 *
 * Their accounts, badges, and founding_fan_number stay. This list is the
 * deploy-time exclusion so the wall is correct before
 * scripts/hide-internal-founding-fans.sql is run by hand. fans.is_internal
 * is the reversible flag for these people and for anyone added later.
 * Either signal hides the fan.
 *
 * Intentionally not listed, pending owner confirmation:
 *   Founding Fan #8 (no display name)
 *   Founding Fan #12 (no display name)
 *   Morgan wallen, Founding Fan #15
 */
export const INTERNAL_FOUNDING_FAN_IDS = [
  // Staff / team. Hidden. Badge numbers stay.
  "bf02e0cf-b740-407a-9436-222becfc3c49", // Kevin, #1
  "64aa29d4-a0fc-4653-ae5b-06586c0067a7", // countrycarlamoore, #2
  "84996598-c71a-42a8-812c-a2e3ea642de8", // Raymond, #3
  "1922bd3c-becc-4cac-afb8-ceeba8666bb4", // RAY DAWG, #5
  "f198e0e2-5d69-489b-9736-26adf1a690ca", // Eilee, #7
  "f4c5819f-b340-4b7d-82c9-c5fff973eeb2", // Abby, #9
  "094fd522-a559-472b-aab0-1aa49bba8aab", // Jackie, #10
  // Internal test accounts. Same public treatment. Not deleted.
  "234f4222-fe96-46e2-b403-9ca5fe3ac905", // FE Walk Tester, #14
  "44038dc7-7fb4-431c-86a3-02553a534c35", // atsh, #16
  "4b83c23e-775b-455f-b792-e31601e85e5b", // Launch Test, #17
  "e2e3d3ef-824a-4951-8cdc-70ed574c6544", // Hana QA, #20
] as const;

export const INTERNAL_FOUNDING_FAN_ID_SET: ReadonlySet<string> = new Set(
  INTERNAL_FOUNDING_FAN_IDS,
);

export function isHiddenFromPublicFoundingRoster(
  fanId: string,
  isInternal: boolean | null | undefined,
): boolean {
  if (isInternal === true) return true;
  return INTERNAL_FOUNDING_FAN_ID_SET.has(fanId);
}
