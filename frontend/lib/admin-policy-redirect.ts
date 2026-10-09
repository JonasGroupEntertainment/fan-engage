/**
 * Mailchimp's SMS program links its disclosure at
 * /admin/policies/terms and /admin/policies/privacy. Those URLs are the
 * admin editor. A visitor who is not an admin (logged out, or signed in
 * without an admin grant) is sent to the public policy instead of the
 * login wall. Admins are not redirected. No other /admin path is opened.
 */

const PUBLIC_POLICY_BY_ADMIN_PATH: Record<string, "/terms" | "/privacy"> = {
  "/admin/policies/terms": "/terms",
  "/admin/policies/privacy": "/privacy",
};

function normalizeAdminPath(pathname: string): string {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

/**
 * Public destination for the two Mailchimp policy URLs, or null.
 * Ignores the query string (callers pass pathname only). One trailing
 * slash is ignored. Anything else, including /admin/policies and
 * /admin/fans, stays on the admin gate.
 */
export function guestAdminPolicyRedirect(
  pathname: string,
): "/terms" | "/privacy" | null {
  return PUBLIC_POLICY_BY_ADMIN_PATH[normalizeAdminPath(pathname)] ?? null;
}

export type AdminPolicyGate =
  | { action: "public"; to: "/terms" | "/privacy"; status: 307 }
  | { action: "login" }
  | { action: "continue" };

/**
 * Where a request for an /admin path should go.
 * - The two policy URLs: public page unless the caller is an admin.
 * - Any other /admin path with no session: login, same as today.
 * - An admin on a policy URL: the editor (no redirect).
 */
export function adminPolicyGate(input: {
  pathname: string;
  signedIn: boolean;
  isAdmin: boolean;
}): AdminPolicyGate {
  const policy = guestAdminPolicyRedirect(input.pathname);
  if (policy) {
    if (input.isAdmin) return { action: "continue" };
    return { action: "public", to: policy, status: 307 };
  }
  if (!input.signedIn && normalizeAdminPath(input.pathname).startsWith("/admin")) {
    return { action: "login" };
  }
  return { action: "continue" };
}
