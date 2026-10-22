/**
 * Accounts that are staff, company, or agent mail — never public fans.
 *
 * Signup (the auth trigger in 0077, plus tagInternalAccountOnSignup)
 * sets fans.is_internal. The one-off backfill in that migration does
 * the same for rows that already exist. Rows that do not match are
 * left as they are. Nothing is deleted.
 *
 * Keep this list in sync with fan_email_is_internal() in
 * supabase/migrations/0077_internal_account_tag.sql.
 */

export const INTERNAL_EMAIL_DOMAINS = [
  "jonasgroup.com",
  "grokbot.com",
  "agentmail.to",
] as const;

/**
 * Staff whose mail is not on a domain above. Company addresses are
 * covered by INTERNAL_EMAIL_DOMAINS.
 */
export const INTERNAL_STAFF_EMAILS = [
  "kevinjonassr@gmail.com",
  "hanaproductmanager@gmail.com",
  "syncnatra@gmail.com",
] as const;

export function normalizeAccountEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Domain after the first @. Empty when the address has no local part. */
export function accountEmailDomain(email: string): string {
  const normalized = normalizeAccountEmail(email);
  const at = normalized.indexOf("@");
  if (at <= 0 || at === normalized.length - 1) return "";
  return normalized.slice(at + 1);
}

export function isInternalAccountEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = normalizeAccountEmail(email);
  if (!normalized) return false;
  if ((INTERNAL_STAFF_EMAILS as readonly string[]).includes(normalized)) return true;
  const domain = accountEmailDomain(normalized);
  return (INTERNAL_EMAIL_DOMAINS as readonly string[]).includes(domain);
}
