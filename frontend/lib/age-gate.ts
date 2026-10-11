/**
 * Age check for COPPA and adult-only features. Pure module, no imports.
 *
 * Under 13: no account, nothing stored. 13 to 17: free account only.
 * 18 and up: paid tiers and texts. Dates are calendar dates in UTC.
 */

export type AgeBand = "under13" | "teen" | "adult";

export const MIN_ACCOUNT_AGE = 13;
export const ADULT_AGE = 18;
const MAX_AGE = 120;

/** Shown when sign-up is refused. Neutral on purpose: no hint at the cutoff. */
export const AGE_BLOCKED_MESSAGE = "Sorry, we can't create an account for you right now.";
export const AGE_ADULT_ONLY_MESSAGE =
  "Paid memberships and text alerts are for fans 18 and older.";
export const AGE_REQUIRED_MESSAGE =
  "Please add your date of birth to continue. We only use it to confirm which features you can use.";

/** Session flag set after a blocked attempt so the form stays closed. */
export const AGE_BLOCK_STORAGE_KEY = "fep_age_block";

function toInt(part: string): number | null {
  const trimmed = part.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** A real, past date of birth no more than 120 years ago, or null. */
export function parseBirthDate(
  year: string,
  month: string,
  day: string,
  now: Date = new Date(),
): Date | null {
  const y = toInt(year);
  const m = toInt(month);
  const d = toInt(day);
  if (y == null || m == null || d == null || y < 1000) return null;
  const dob = new Date(Date.UTC(y, m - 1, d));
  if (
    dob.getUTCFullYear() !== y ||
    dob.getUTCMonth() !== m - 1 ||
    dob.getUTCDate() !== d
  ) {
    return null;
  }
  if (dob.getTime() > now.getTime()) return null;
  if (ageOn(dob, now) > MAX_AGE) return null;
  return dob;
}

/** Reads a stored "YYYY-MM-DD" value. */
export function parseBirthDateIso(
  iso: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!match) return null;
  return parseBirthDate(match[1], match[2], match[3], now);
}

export function toIsoDate(dob: Date): string {
  return dob.toISOString().slice(0, 10);
}

/** Whole years old on the given day. */
export function ageOn(dob: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function ageBand(dob: Date, now: Date = new Date()): AgeBand {
  const age = ageOn(dob, now);
  if (age < MIN_ACCOUNT_AGE) return "under13";
  if (age < ADULT_AGE) return "teen";
  return "adult";
}

export function isUnder13(dob: Date, now: Date = new Date()): boolean {
  return ageBand(dob, now) === "under13";
}

/** False when the date is unknown, so adult-only features stay closed. */
export function isAdult(dob: Date | null | undefined, now: Date = new Date()): boolean {
  return dob != null && ageBand(dob, now) === "adult";
}

export type AdultGate = "ok" | "required" | "adult_only";

/**
 * Gate for adult-only features from a stored "YYYY-MM-DD" birth date.
 * Unknown means "required" so the fan is asked first.
 */
export function adultGate(storedIso: string | null | undefined, now: Date = new Date()): AdultGate {
  const dob = parseBirthDateIso(storedIso, now);
  if (!dob) return "required";
  return isAdult(dob, now) ? "ok" : "adult_only";
}

/** Pages the birth date form may send a fan back to. */
export const BIRTH_DATE_RETURN_PATHS = ["/premium", "/me/notifications"] as const;

export function birthDateReturnPath(raw: unknown): string {
  return typeof raw === "string" && (BIRTH_DATE_RETURN_PATHS as readonly string[]).includes(raw)
    ? raw
    : "/";
}

/**
 * SMS opt-in after the 18+ rule. A new opt-in needs a known adult birth
 * date. A fan already opted in with no birth date keeps it (grandfathered).
 * A known under-18 birth date always turns it off.
 */
export function adultSmsOptIn(
  requested: boolean,
  storedIso: string | null | undefined,
  alreadyOptedIn: boolean,
  now: Date = new Date(),
): boolean {
  if (!requested) return false;
  const gate = adultGate(storedIso ?? null, now);
  return gate === "ok" || (gate === "required" && alreadyOptedIn);
}
