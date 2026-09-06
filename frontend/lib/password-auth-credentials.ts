export type PasswordAuthCredentialsInput = {
  email: string;
  password: string;
  turnstileConfigured: boolean;
  turnstileToken: string | null;
};

export type PasswordAuthCredentials = {
  email: string;
  password: string;
  options?: { captchaToken: string };
};

/** Build the credentials consumed by Supabase Auth for password sign-in. */
export function buildPasswordAuthCredentials(
  input: PasswordAuthCredentialsInput,
): PasswordAuthCredentials {
  const credentials: PasswordAuthCredentials = {
    email: input.email,
    password: input.password,
  };

  if (input.turnstileConfigured) {
    const captchaToken = input.turnstileToken?.trim();
    if (!captchaToken) throw new Error("Turnstile token is required for password login");
    credentials.options = { captchaToken };
  }

  return credentials;
}
