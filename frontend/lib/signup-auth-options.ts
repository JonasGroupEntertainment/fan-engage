export type SignupAuthOptionsInput = {
  emailRedirectTo: string;
  turnstileConfigured: boolean;
  turnstileToken: string | null;
  consentVersion?: string;
  acceptedAt?: string;
  /** E.164 phone from the optional public signup field. */
  phone?: string | null;
  /** True only when the SMS box was ticked and a phone is present. */
  smsOptedIn?: boolean;
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

  const data: Record<string, string> = {};
  if (input.consentVersion) {
    data.consent_accepted_at = input.acceptedAt ?? new Date().toISOString();
    data.consent_version = input.consentVersion;
  }
  if (input.phone) data.phone = input.phone;
  if (input.smsOptedIn === true) data.sms_opted_in = "true";
  if (Object.keys(data).length > 0) options.data = data;

  return options;
}
