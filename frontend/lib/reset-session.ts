/**
 * Who may set a new password on /reset-password.
 *
 * A new password needs proof that the person controls the account's email:
 * a reset link opened on this page, or a session that an emailed link or
 * code created. A session from an ordinary password sign-in is not enough,
 * so that person is sent to ask for a reset link instead. This is a check in
 * the page, for the person at the keyboard; it is not the only safeguard.
 */

/**
 * Sign-in methods that do NOT prove control of the mailbox. A session made
 * only by these is sent to ask for a reset link. Anything else (a reset
 * link, an emailed code, an invite) is let through, and so is a session this
 * code cannot read: wrongly turning away a fan with a real reset link is the
 * worse mistake, because the link is the only way an imported fan gets in.
 */
const ORDINARY_SIGN_IN_METHODS: readonly string[] = [
  "password",
  "oauth",
  "sso/saml",
  "email/signup",
  "anonymous",
  "web3",
  // A second sign-in step on top of a password is still an ordinary sign-in.
  "totp",
  "mfa/phone",
  "mfa/webauthn",
];

export type ResetPageState = "ready" | "needs_link" | "missing";

function decodeClaims(accessToken: string | null | undefined): Record<string, unknown> | null {
  const payload = (accessToken ?? "").split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const claims: unknown = JSON.parse(atob(padded));
    if (claims === null || typeof claims !== "object" || Array.isArray(claims)) return null;
    return claims as Record<string, unknown>;
  } catch {
    return null;
  }
}

function methodOf(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry !== null && typeof entry === "object") {
    const method = (entry as { method?: unknown }).method;
    return typeof method === "string" ? method : null;
  }
  return null;
}

/** True when the session's own record shows only an ordinary sign-in. */
export function isOrdinarySignInSession(accessToken: string | null | undefined): boolean {
  const amr = decodeClaims(accessToken)?.amr;
  if (!Array.isArray(amr) || amr.length === 0) return false;
  return amr.every((entry) => {
    const method = methodOf(entry);
    return method !== null && ORDINARY_SIGN_IN_METHODS.includes(method);
  });
}

export function resetPageState(input: {
  /** This page load itself opened a valid emailed link. */
  linkOpenedHere: boolean;
  /** The current session's access token, or null when signed out. */
  accessToken: string | null | undefined;
}): ResetPageState {
  if (!input.accessToken) return "missing";
  if (input.linkOpenedHere) return "ready";
  return isOrdinarySignInSession(input.accessToken) ? "needs_link" : "ready";
}
