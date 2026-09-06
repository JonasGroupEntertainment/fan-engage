export type MagicLinkAuthOptionsInput = {
  emailRedirectTo: string;
  turnstileConfigured: boolean;
  turnstileToken: string | null;
};

export type MagicLinkAuthOptions = {
  emailRedirectTo: string;
  captchaToken?: string;
};

/** Build the options consumed by Supabase Auth for a magic-link request. */
export function buildMagicLinkAuthOptions(
  input: MagicLinkAuthOptionsInput,
): MagicLinkAuthOptions {
  const options: MagicLinkAuthOptions = { emailRedirectTo: input.emailRedirectTo };

  if (input.turnstileConfigured) {
    const captchaToken = input.turnstileToken?.trim();
    if (!captchaToken) throw new Error("Turnstile token is required for magic link login");
    options.captchaToken = captchaToken;
  }

  return options;
}
