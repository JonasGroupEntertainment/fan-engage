/**
 * Auth doors that are not yet proven in production.
 *
 * Password signup + password sign-in stay. Magic-link / email-OTP
 * failed on 2026-08-26 (same-browser verify → "PKCE code verifier not
 * found in storage") and stays hidden in production until enabled.
 *
 * Forgot password is on by default. The server sends our own link
 * (/reset-password?token_hash=...) and the token is only verified when the
 * new password is submitted, so mail scanners can't burn it. Turn it off
 * with NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED=false.
 */

export type AuthDoorsEnv = {
  NEXT_PUBLIC_MAGIC_LINK_ENABLED?: string;
  NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED?: string;
  NEXT_PUBLIC_VERCEL_ENV?: string;
  VERCEL_ENV?: string;
};

function vercelEnvOf(env: AuthDoorsEnv): string | undefined {
  return env.NEXT_PUBLIC_VERCEL_ENV || env.VERCEL_ENV;
}

export function isMagicLinkEnabled(
  env: AuthDoorsEnv = {
    NEXT_PUBLIC_MAGIC_LINK_ENABLED: process.env.NEXT_PUBLIC_MAGIC_LINK_ENABLED,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  },
): boolean {
  const explicit = env.NEXT_PUBLIC_MAGIC_LINK_ENABLED?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  // Production stays password-first until PKCE is proven.
  return vercelEnvOf(env) !== "production";
}

export function isForgotPasswordEnabled(
  env: AuthDoorsEnv = {
    NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED:
      process.env.NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  },
): boolean {
  const explicit = env.NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  // On by default. The reset email now links to /reset-password with a
  // token_hash that is only verified on submit, so the 2026-08-26 PKCE
  // failure and mail-scanner token burn no longer apply.
  return true;
}
