export function buildPasswordRecoveryOptions(input: {
  redirectTo: string;
  turnstileConfigured: boolean;
  turnstileToken: string | null;
}): { redirectTo: string; captchaToken?: string } {
  if (!input.turnstileConfigured) return { redirectTo: input.redirectTo };
  const captchaToken = input.turnstileToken?.trim();
  if (!captchaToken) throw new Error("Complete the security check, then try again.");
  return { redirectTo: input.redirectTo, captchaToken };
}
