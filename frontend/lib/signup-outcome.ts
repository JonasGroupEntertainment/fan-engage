export const SIGNUP_NOT_CREATED_MESSAGE =
  "Account wasn't created. Complete the security check or tap Retry, then try again.";

export const SIGNUP_CREATE_FAILED_MESSAGE =
  "We couldn’t create your account. Try again in a moment.";

export const SIGNUP_EMAIL_IN_USE_MESSAGE =
  "That email is already in use. Sign in, or try a different email.";

const EMAIL_IN_USE_RE =
  /already registered|already been registered|already exists|email.*(?:in use|taken)|user already/i;

const RAW_BACKEND_RE =
  /database error|saving new user|sqlstate|postgres|duplicate key|unique constraint|violates|permission denied|row-level security|unexpected_failure|42501|23505|42p10|pq:|gotrue|auth\.users/i;

export type SignupUserLike = {
  identities?: Array<unknown> | null;
} | null | undefined;

export function didSignupCreateUser(user: SignupUserLike): boolean {
  if (!user) return false;
  if (Array.isArray(user.identities) && user.identities.length === 0) return false;
  return true;
}

/**
 * Never show raw GoTrue / Postgres text on /signup.
 * Known cases get a specific line; everything else is the generic retry copy.
 */
export function sanitizeSignupError(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return SIGNUP_CREATE_FAILED_MESSAGE;
  if (text === SIGNUP_NOT_CREATED_MESSAGE) return SIGNUP_NOT_CREATED_MESSAGE;
  if (text === SIGNUP_CREATE_FAILED_MESSAGE) return SIGNUP_CREATE_FAILED_MESSAGE;
  if (text === SIGNUP_EMAIL_IN_USE_MESSAGE) return SIGNUP_EMAIL_IN_USE_MESSAGE;
  if (EMAIL_IN_USE_RE.test(text)) return SIGNUP_EMAIL_IN_USE_MESSAGE;
  return SIGNUP_CREATE_FAILED_MESSAGE;
}

export function isRawSignupBackendError(raw: string | null | undefined): boolean {
  return RAW_BACKEND_RE.test((raw ?? "").trim());
}

export type SignupCreateInput = {
  signUpError: string | null;
  user: SignupUserLike;
  session: unknown | null;
  signInError: string | null;
  signInSession: unknown | null;
};

export type SignupCreateDecision = {
  action: "proceed" | "stay-error";
  message: string;
};

/**
 * Password signup must not send a fan to login after a silent non-create.
 * Stay on /signup with a clear error whenever no session exists.
 */
export function interpretSignupCreate(opts: SignupCreateInput): SignupCreateDecision {
  if (opts.signUpError) {
    return { action: "stay-error", message: sanitizeSignupError(opts.signUpError) };
  }
  if (!didSignupCreateUser(opts.user)) {
    return { action: "stay-error", message: SIGNUP_NOT_CREATED_MESSAGE };
  }
  if (opts.session || opts.signInSession) {
    return { action: "proceed", message: "" };
  }
  return { action: "stay-error", message: SIGNUP_NOT_CREATED_MESSAGE };
}

export type SignupErrorReport = {
  message?: string | null;
  code?: string | null;
};

/** Fire-and-forget: raw error stays on the server log, never in the UI. */
export function reportSignupError(report: SignupErrorReport): void {
  if (typeof fetch !== "function") return;
  const message = (report.message ?? "").trim();
  const code = (report.code ?? "").trim();
  if (!message && !code) return;
  void fetch("/api/auth/signup-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: message.slice(0, 300),
      code: code.slice(0, 80) || null,
    }),
    keepalive: true,
  }).catch(() => {
    // Logging must never block or surface on /signup.
  });
}
