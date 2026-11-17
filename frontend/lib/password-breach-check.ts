/**
 * Checks a new password against the public Pwned Passwords list while the
 * person is still typing, so they hear "this one has leaked" before they
 * press the button, not after. Supabase runs the same check on sign-up
 * and is the one that actually enforces it; this is only the early warning.
 *
 * The password never leaves the browser. Only the first five characters of
 * its SHA-1 hash are sent, and the list of matching endings is compared
 * here (k-anonymity range search).
 */

const RANGE_URL = "https://api.pwnedpasswords.com/range/";

export async function sha1Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * True when the hash ending appears in a range response with a real count.
 * Lines look like "0018A45C4D1DEF81644B54AB7F969B88D65:21". Padding lines
 * carry a count of 0 and are ignored.
 */
export function suffixInRange(rangeBody: string, suffix: string): boolean {
  const wanted = suffix.trim().toUpperCase();
  if (!wanted) return false;
  for (const line of rangeBody.split(/\r?\n/)) {
    const [ending, count] = line.trim().split(":");
    if (ending?.toUpperCase() === wanted) return Number(count) > 0;
  }
  return false;
}

/** true = leaked, false = not on the list, null = could not check. */
export async function isBreachedPassword(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | null> {
  try {
    const hash = await sha1Hex(password);
    const res = await fetchImpl(`${RANGE_URL}${hash.slice(0, 5)}`, {
      headers: { "Add-Padding": "true" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return suffixInRange(await res.text(), hash.slice(5));
  } catch {
    return null;
  }
}
