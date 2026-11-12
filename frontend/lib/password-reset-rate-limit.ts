/**
 * Rate limit policy for "forgot password" requests.
 *
 * Two separate budgets, the same shape /api/auth/imported-account uses:
 *
 *   - per IP: stops one visitor from requesting resets for a long list of
 *     different addresses (finding out who has an account, or mailing many
 *     people);
 *   - per email: stops one address from being mailed again and again by
 *     requests coming from many IPs.
 *
 * One key built from the IP and the email together does neither: every new
 * address, or every new IP, starts a fresh budget.
 *
 * Pure: no Next or Supabase imports, so node tests can load it. The caller
 * passes in the function that actually consumes a budget.
 */

/** Requests allowed per budget inside one window. */
export const PASSWORD_RESET_LIMIT = 5;
/** Length of the window, in seconds. */
export const PASSWORD_RESET_WINDOW_SECONDS = 15 * 60;

/** What getClientIp falls back to when no address header is present. */
const UNKNOWN_IP = "unknown";

export type PasswordResetBudget = {
  scope: "password-reset:ip" | "password-reset:email";
  identifier: string;
  limit: number;
  windowSeconds: number;
};

export type BudgetDecision = { allowed: boolean; reason?: string };

/**
 * The budgets one request has to fit inside, in the order to check them.
 * IP first: once an IP is blocked, its requests must not also use up the
 * budget of whatever address it names.
 *
 * An unknown IP gets no IP budget. Otherwise every visitor without an
 * address header would share one bucket and lock each other out.
 */
export function passwordResetBudgets(ip: string, email: string): PasswordResetBudget[] {
  const shared = { limit: PASSWORD_RESET_LIMIT, windowSeconds: PASSWORD_RESET_WINDOW_SECONDS };
  const knownIp = (ip ?? "").trim();
  const ipBudget: PasswordResetBudget[] =
    knownIp && knownIp !== UNKNOWN_IP
      ? [{ scope: "password-reset:ip", identifier: knownIp, ...shared }]
      : [];
  return [...ipBudget, { scope: "password-reset:email", identifier: email, ...shared }];
}

/**
 * True when the request may go ahead. Only a spent budget blocks it: if the
 * limiter is unreachable the request is let through, because the Turnstile
 * check still stands in front of the email and an outage must not stop fans
 * resetting a password.
 */
export async function isUnderPasswordResetLimit(
  ip: string,
  email: string,
  consume: (budget: PasswordResetBudget) => Promise<BudgetDecision>,
): Promise<boolean> {
  for (const budget of passwordResetBudgets(ip, email)) {
    let decision: BudgetDecision;
    try {
      decision = await consume(budget);
    } catch {
      continue;
    }
    if (!decision.allowed && decision.reason === "exhausted") return false;
  }
  return true;
}
