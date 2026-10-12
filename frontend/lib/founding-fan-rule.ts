/** One Founding Fan rule: first 100 free joins. Not a date window. Not Premium. */
export const FOUNDING_FAN_RULE =
  "Free badge for the first 100 fans who join. Numbered badge and 1.5× points, plus 48-hour early RSVP. Not a Premium purchase and not a date window.";

const LEGACY_FOUNDING_COPY = [
  /july\s*15/i,
  /pre-?jul/i,
  /founding window/i,
  /locked-in pricing/i,
  /paying fans/i,
];

export function isLegacyFoundingCopy(text: string): boolean {
  return LEGACY_FOUNDING_COPY.some((re) => re.test(text));
}

export function publicFoundingFanDescription(raw: string | null | undefined): string {
  if (!raw || isLegacyFoundingCopy(raw)) return FOUNDING_FAN_RULE;
  return raw;
}
