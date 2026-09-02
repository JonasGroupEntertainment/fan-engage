export const SIGNUP_NOT_CREATED_MESSAGE =
  "Account wasn't created. Complete the security check or tap Retry, then try again.";

export type SignupUserLike = {
  identities?: Array<unknown> | null;
} | null | undefined;

export function didSignupCreateUser(user: SignupUserLike): boolean {
  if (!user) return false;
  if (Array.isArray(user.identities) && user.identities.length === 0) return false;
  return true;
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
    return { action: "stay-error", message: opts.signUpError };
  }
  if (!didSignupCreateUser(opts.user)) {
    return { action: "stay-error", message: SIGNUP_NOT_CREATED_MESSAGE };
  }
  if (opts.session || opts.signInSession) {
    return { action: "proceed", message: "" };
  }
  return { action: "stay-error", message: SIGNUP_NOT_CREATED_MESSAGE };
}
