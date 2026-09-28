/**
 * Calendar day in US Eastern time (America/New_York) as YYYY-MM-DD.
 *
 * Daily features (check-ins, daily drops) roll over at Eastern midnight,
 * not UTC midnight, so a fan in the US never sees "tomorrow" start at 7 or
 * 8 pm. Handles daylight saving automatically.
 */
export const EASTERN_TIME_ZONE = "America/New_York";

export function easternDateString(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: EASTERN_TIME_ZONE });
}
