/**
 * Signup must never create an account without a verified Turnstile token
 * when keys are configured. Cloudflare outage fail-open is opt-in only.
 */
export function turnstileUpstreamFailOpen(opts: {
  failOpenEnv?: string;
  failClosedRequest?: boolean;
  vercelEnv?: string;
}): boolean {
  if (opts.failClosedRequest) return false;
  if (opts.vercelEnv === "production") return false;
  const v = opts.failOpenEnv;
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}
