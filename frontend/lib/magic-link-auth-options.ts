export type MagicLinkAuthOptionsInput = {
  emailRedirectTo: string;
  turnstileConfigured: boolean;
  turnstileToken: string | null;
};

export type MagicLinkAuthOptions = {
  emailRedirectTo: string;
  /** Always false: accounts are only created by the signup form (0071). */
  shouldCreateUser: false;
  captchaToken?: string;
};

/**
 * Shown after any magic-link request that did not fail for a real reason.
 * Same text whether or not the email has an account, so the login page
 * cannot be used to find out who is signed up.
 */
export const MAGIC_LINK_SENT_MESSAGE =
  "If this email has a Fan Engage account, a magic link is on its way. Use the newest link; requesting another one invalidates the previous one. New here? Create an account first.";

/** Build the options consumed by Supabase Auth for a magic-link request. */
export function buildMagicLinkAuthOptions(
  input: MagicLinkAuthOptionsInput,
): MagicLinkAuthOptions {
  const options: MagicLinkAuthOptions = {
    emailRedirectTo: input.emailRedirectTo,
    shouldCreateUser: false,
  };

  if (input.turnstileConfigured) {
    const captchaToken = input.turnstileToken?.trim();
    if (!captchaToken) throw new Error("Turnstile token is required for magic link login");
    options.captchaToken = captchaToken;
  }

  return options;
}

/**
 * True when Supabase refused the magic link only because the email has no
 * account (shouldCreateUser: false). Treated like a success on screen.
 */
export function isNoAccountMagicLinkError(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "otp_disabled") return true;
  return /signups not allowed for otp/i.test(error.message ?? "");
}
