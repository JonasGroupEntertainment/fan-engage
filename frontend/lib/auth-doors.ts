/**
 * Auth doors that are not yet proven in production.
 *
 * Password + forgot-password stay. Magic-link / email-OTP is PKCE and was
 * proven broken on 2026-08-26 (same-browser verify →
 * "PKCE code verifier not found in storage"). Hide that CTA in production
 * until an explicit enable flag is set after PKCE actually works.
 */

export type AuthDoorsEnv = {
  NEXT_PUBLIC_MAGIC_LINK_ENABLED?: string;
  NEXT_PUBLIC_VERCEL_ENV?: string;
  VERCEL_ENV?: string;
};

function vercelEnvOf(env: AuthDoorsEnv): string | undefined {
  return env.NEXT_PUBLIC_VERCEL_ENV || env.VERCEL_ENV;
}

export function isMagicLinkEnabled(env: AuthDoorsEnv = process.env): boolean {
  const explicit = env.NEXT_PUBLIC_MAGIC_LINK_ENABLED?.trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  // Production stays password-first until PKCE is proven.
  return vercelEnvOf(env) !== "production";
}
