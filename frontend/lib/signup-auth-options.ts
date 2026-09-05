export type SignupAuthOptionsInput = {
  emailRedirectTo: string;
  turnstileConfigured: boolean;
  turnstileToken: string | null;
  consentVersion?: string;
  acceptedAt?: string;
};

export type SignupAuthOptions = {
  emailRedirectTo: string;
  captchaToken?: string;
  data?: Record<string, string>;
};

/** Build the options consumed by Supabase Auth for the account-creation call. */
export function buildSignupAuthOptions(input: SignupAuthOptionsInput): SignupAuthOptions {
  const options: SignupAuthOptions = { emailRedirectTo: input.emailRedirectTo };

  if (input.turnstileConfigured) {
    const captchaToken = input.turnstileToken?.trim();
    if (!captchaToken) throw new Error("Turnstile token is required for signup");
    options.captchaToken = captchaToken;
  }

  if (input.consentVersion) {
    options.data = {
      consent_accepted_at: input.acceptedAt ?? new Date().toISOString(),
      consent_version: input.consentVersion,
    };
  }

  return options;
}
