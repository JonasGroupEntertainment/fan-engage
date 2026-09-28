import { normalizePhoneE164 } from "../phone.ts";

/**
 * Pure helpers for the admin CSV fan import. An import may add details a
 * fan has not given yet, but must never overwrite what a fan already set
 * (name, phone, city, social handles). Phones are normalized to E.164 the
 * same way every other phone write is.
 */

export interface FanImportRow {
  email?: string;
  first_name?: string;
  phone?: string;
  instagram?: string;
  tiktok?: string;
  city?: string;
}

export interface ExistingFanFields {
  first_name?: string | null;
  phone?: string | null;
  city?: string | null;
  socials?: Record<string, string> | null;
}

export const MAX_IMPORT_ROWS_PER_REQUEST = 500;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeImportEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanHandle(value: unknown): string | null {
  const v = clean(value);
  return v ? v.replace(/^@/, "") : null;
}

/**
 * Build the fields to write for one CSV row. Pass `existing` as null for a
 * brand new fan. Returns only fields that are blank today and have a value
 * in the CSV, so an import can never replace data the fan already has.
 * An invalid phone is dropped (not written) rather than failing the row.
 */
export function buildFanImportPatch(
  existing: ExistingFanFields | null,
  row: FanImportRow,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const firstName = clean(row.first_name);
  if (firstName && isBlank(existing?.first_name)) patch.first_name = firstName;

  const city = clean(row.city);
  if (city && isBlank(existing?.city)) patch.city = city;

  if (isBlank(existing?.phone)) {
    const phone = normalizePhoneE164(clean(row.phone));
    if (phone.ok && phone.phone) patch.phone = phone.phone;
  }

  const currentSocials = existing?.socials ?? {};
  const nextSocials: Record<string, string> = { ...currentSocials };
  let socialsChanged = false;
  for (const key of ["instagram", "tiktok"] as const) {
    const handle = cleanHandle(row[key]);
    if (handle && isBlank(currentSocials[key])) {
      nextSocials[key] = handle;
      socialsChanged = true;
    }
  }
  if (socialsChanged) patch.socials = nextSocials;

  return patch;
}
