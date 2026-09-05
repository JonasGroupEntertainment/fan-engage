type RateLimitEnvironment = {
  RATE_LIMIT_HASH_SALT?: string;
  VERCEL_ENV?: string;
  NEXT_PUBLIC_VERCEL_ENV?: string;
};

export function authRateLimitSalt(env: RateLimitEnvironment): string {
  const configured = env.RATE_LIMIT_HASH_SALT?.trim();
  if (configured) return configured;

  const deployment = env.VERCEL_ENV ?? env.NEXT_PUBLIC_VERCEL_ENV;
  if (deployment === "production") {
    throw new Error("RATE_LIMIT_HASH_SALT is required in production");
  }
  return "fan-engage-local-rate-limit";
}
