import { LAUNCH_COMMUNITY_ID } from "./launch-catalog.ts";
import { didSignupCreateUser, interpretSignupCreate, type SignupUserLike } from "./signup-outcome.ts";

export const RAELYNN_MEMBERSHIP_CONFLICT = "fan_id,community_id";

/**
 * Membership row for an imported fan. founding_fan_number is omitted so
 * the insert cannot take a Founding Fan slot.
 */
export function raelynnMembershipRow(fanId: string, joinedAt: string) {
  return {
    fan_id: fanId,
    community_id: LAUNCH_COMMUNITY_ID,
    total_points: 0,
    current_tier: "bronze" as const,
    status: "active" as const,
    joined_at: joinedAt,
  };
}

/**
 * Copy shown only after the admin lookup confirms this email is an
 * imported account that has never signed in. Every other signup miss
 * keeps the generic existing-account line.
 */
export const IMPORTED_SET_PASSWORD_MESSAGE =
  "You're already on the list. Set your password";

export const IMPORTED_RESET_SENT_MESSAGE =
  "Check your email for a link to set your password. Use the newest link — requesting another one invalidates the previous one.";

export const IMPORTED_RESET_FAILED_MESSAGE =
  "We couldn't send that email. Try again in a moment.";

export const IMPORTED_RESET_LIMIT_MESSAGE =
  "Too many attempts. Please wait about 15 minutes, then try again.";

export const IMPORTED_RESET_CHECK_MESSAGE =
  "Complete the security check, then try again.";

/**
 * Fields the Auth admin API actually returns. `encrypted_password` is not
 * one of them: GoTrue's admin createUser stores a random bcrypt hash even
 * when no password was supplied (18 Jun 2026 import), so "no password"
 * cannot be read off the hash. The fan never chose that hash and cannot
 * sign in with it.
 */
export type AuthUserProbe = {
  id?: string;
  email?: string | null;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  confirmation_sent_at?: string | null;
  invited_at?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

export type ImportedAccountAction = "classify" | "send-reset";

export type ImportedAccountBody = {
  outcome: "set-password" | "generic";
  sent?: boolean;
  error?: string;
};

export type LimitDecision =
  | { allowed: true }
  | { allowed: false; reason: "exhausted" | "backend_unavailable" };

function isBlankTimestamp(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

function isFanImportFlag(user: AuthUserProbe): boolean {
  const flag = user.app_metadata?.fan_import;
  return flag === true || flag === "true";
}

function isEmailProvider(user: AuthUserProbe): boolean {
  if (user.app_metadata?.provider === "email") return true;
  const providers = user.app_metadata?.providers;
  return Array.isArray(providers) && providers.length === 1 && providers[0] === "email";
}

/**
 * 18 Jun admin createUser({ email, email_confirm: true }) wrote exactly
 * this user_metadata and never sent a confirmation or invite. Real
 * signups add birth_date / consent and send a confirmation.
 */
function isBareVerifiedMetadata(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta) return false;
  const keys = Object.keys(meta);
  return keys.length === 1 && keys[0] === "email_verified" && meta.email_verified === true;
}

/**
 * Durable import marker. Stays true after the first sign-in, so membership
 * repair can still run once last_sign_in_at is populated by the recovery
 * session. Signup copy must use isImportedPasswordlessSignup instead.
 */
export function isDurableImportAccount(user: AuthUserProbe | null | undefined): boolean {
  if (!user) return false;
  if (isBlankTimestamp(user.email_confirmed_at)) return false;
  if (isFanImportFlag(user)) return true;
  if (!isBlankTimestamp(user.confirmation_sent_at)) return false;
  if (!isBlankTimestamp(user.invited_at)) return false;
  if (!isEmailProvider(user)) return false;
  return isBareVerifiedMetadata(user.user_metadata ?? null);
}

/** Never signed in, and created by the admin import rather than /signup. */
export function isImportedPasswordlessSignup(user: AuthUserProbe | null | undefined): boolean {
  if (!isDurableImportAccount(user)) return false;
  return isBlankTimestamp(user?.last_sign_in_at);
}

export type SignupDeadEndInput = {
  signUpError: string | null;
  user: SignupUserLike;
  session: unknown | null;
  signInError: string | null;
  signInSession: unknown | null;
  /** Admin-API user, or null when the lookup misses or fails. */
  adminUser: AuthUserProbe | null;
};

export type SignupDeadEndDecision = {
  action: "proceed" | "stay-error" | "set-password";
  message: string;
};

/**
 * Password signup against an email that already exists returns a user with
 * empty identities and no session. The follow-up password sign-in fails
 * because the import never gave the fan a password they know. That pair is
 * the dead end. The set-password action is reserved for the import shape.
 */
export function resolveSignupDeadEnd(input: SignupDeadEndInput): SignupDeadEndDecision {
  const decision = interpretSignupCreate({
    signUpError: input.signUpError,
    user: input.user,
    session: input.session,
    signInError: input.signInError,
    signInSession: input.signInSession,
  });
  if (decision.action === "proceed") return { action: "proceed", message: "" };
  const silentExisting =
    !input.signUpError && !didSignupCreateUser(input.user);
  if (silentExisting && isImportedPasswordlessSignup(input.adminUser)) {
    return { action: "set-password", message: IMPORTED_SET_PASSWORD_MESSAGE };
  }
  return { action: "stay-error", message: decision.message };
}

export function pickAuthUserByEmail(
  users: readonly AuthUserProbe[],
  email: string,
): AuthUserProbe | null {
  const want = email.trim().toLowerCase();
  if (!want) return null;
  return users.find((user) => (user.email ?? "").trim().toLowerCase() === want) ?? null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAccountEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return EMAIL_RE.test(email) ? email : null;
}

export async function findAuthUserByEmail(
  email: string,
  deps: {
    fetch: typeof fetch;
    supabaseUrl: string;
    serviceKey: string;
  },
): Promise<AuthUserProbe | null> {
  const want = normalizeAccountEmail(email);
  if (!want) return null;
  const endpoint = new URL("/auth/v1/admin/users", deps.supabaseUrl);
  endpoint.searchParams.set("filter", want);
  endpoint.searchParams.set("page", "1");
  endpoint.searchParams.set("per_page", "20");
  const response = await deps.fetch(endpoint, {
    headers: {
      apikey: deps.serviceKey,
      Authorization: `Bearer ${deps.serviceKey}`,
    },
  });
  if (!response.ok) throw new Error("auth lookup failed");
  const body = (await response.json()) as { users?: AuthUserProbe[] };
  return pickAuthUserByEmail(body.users ?? [], want);
}

export type ImportedAccountHandlerInput = {
  action: ImportedAccountAction;
  email: string;
  turnstileToken: string | null;
  turnstileConfigured: boolean;
  consumeLimit: (scope: string) => Promise<LimitDecision>;
  findUser: (email: string) => Promise<AuthUserProbe | null>;
  sendReset: (email: string, captchaToken?: string) => Promise<string | null>;
};

function limitStatus(decision: LimitDecision): number | null {
  if (decision.allowed) return null;
  return decision.reason === "backend_unavailable" ? 503 : 429;
}

/**
 * Classify or send a password-setup email. The set-password outcome is
 * returned only for an imported account that has never signed in. Lookup
 * misses, real accounts, and limiter failures stay on the generic outcome.
 */
export async function handleImportedAccount(
  input: ImportedAccountHandlerInput,
): Promise<{ status: number; body: ImportedAccountBody }> {
  const email = normalizeAccountEmail(input.email);
  if (!email || (input.action !== "classify" && input.action !== "send-reset")) {
    return { status: 400, body: { outcome: "generic" } };
  }

  const limited = limitStatus(await input.consumeLimit(
    input.action === "classify" ? "signup-imported-classify" : "signup-imported-reset",
  ));
  if (limited) {
    return {
      status: limited,
      body: {
        outcome: "generic",
        error: limited === 429 ? IMPORTED_RESET_LIMIT_MESSAGE : undefined,
      },
    };
  }

  if (
    input.action === "send-reset" &&
    input.turnstileConfigured &&
    !input.turnstileToken?.trim()
  ) {
    return {
      status: 400,
      body: { outcome: "generic", sent: false, error: IMPORTED_RESET_CHECK_MESSAGE },
    };
  }

  let user: AuthUserProbe | null = null;
  try {
    user = await input.findUser(email);
  } catch {
    return { status: 200, body: { outcome: "generic", sent: false } };
  }

  if (!isImportedPasswordlessSignup(user)) {
    return { status: 200, body: { outcome: "generic", sent: false } };
  }

  if (input.action === "classify") {
    return { status: 200, body: { outcome: "set-password" } };
  }

  const captcha = input.turnstileToken?.trim();
  let resetError: string | null = null;
  try {
    resetError = await input.sendReset(email, captcha || undefined);
  } catch {
    resetError = "send failed";
  }
  if (resetError) {
    const captchaFailed = /captcha|security check|challenge/i.test(resetError);
    const rateLimited = /rate limit|too many/i.test(resetError);
    if (rateLimited) {
      return {
        status: 429,
        body: { outcome: "generic", sent: false, error: IMPORTED_RESET_LIMIT_MESSAGE },
      };
    }
    return {
      status: captchaFailed ? 400 : 200,
      body: {
        outcome: "generic",
        sent: false,
        error: captchaFailed ? IMPORTED_RESET_CHECK_MESSAGE : IMPORTED_RESET_FAILED_MESSAGE,
      },
    };
  }

  return { status: 200, body: { outcome: "set-password", sent: true } };
}

export async function postImportedAccount(
  body: {
    email: string;
    action: ImportedAccountAction;
    turnstileToken?: string | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: number; body: ImportedAccountBody }> {
  try {
    const response = await fetchImpl("/api/auth/imported-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: body.email,
        action: body.action,
        turnstileToken: body.turnstileToken ?? null,
      }),
    });
    const parsed = (await response.json().catch(() => ({}))) as Partial<ImportedAccountBody>;
    return {
      status: response.status,
      body: {
        outcome: parsed.outcome === "set-password" ? "set-password" : "generic",
        sent: parsed.sent === true,
        error: typeof parsed.error === "string" ? parsed.error : undefined,
      },
    };
  } catch {
    return { status: 0, body: { outcome: "generic", sent: false } };
  }
}
