# API Rate Limiting Implementation

## Overview

This document describes the application-level rate limiting implemented to protect auth and fan data endpoints from abuse. Rate limiting is enforced at the route handler level for all critical endpoints.

## Implementation Details

### Rate Limiter Configuration

The rate limiter uses an in-memory store with a sliding window approach. Requests are tracked by client IP address (extracted from `X-Forwarded-For` or `X-Real-IP` headers).

**Cleanup:** The rate limiter automatically cleans up expired entries every 5 minutes.

### Protected Endpoints

#### Authentication Endpoints (5 requests per 15 minutes)
- `GET /auth/callback` - Magic link confirmation and email verification
- `POST /auth/signout` - User sign-out

**Rationale:** Authentication is a high-value target for abuse (credential stuffing, brute force). The 5-request limit per 15 minutes balances legitimate user flows (password resets, email confirmations) with protection against rapid-fire authentication attempts.

#### Fan Data Endpoints (30 requests per minute)
- `POST /api/fan-engage/onboard` - Fan profile onboarding
- `POST /api/fan-engage/sms` - SMS opt-in and notifications
- `POST /api/fan-engage/mailchimp` - Email list subscription

**Rationale:** Fan data endpoints handle sensitive user information and trigger external API calls (Mailchimp). The 30-request limit per minute prevents bulk data exfiltration and DOS-style hammering of dependent services.

### Rate Limit Response

When a client exceeds the rate limit, the API responds with HTTP 429 (Too Many Requests) and includes helpful headers:

```json
{
  "error": "Too many [operation] requests. Please try again later.",
  "retryAfter": 300
}
```

**Headers:**
- `Retry-After` — Seconds until the rate limit resets (RFC 7231)
- `X-RateLimit-Limit` — Maximum requests allowed per window
- `X-RateLimit-Remaining` — Requests remaining in current window
- `X-RateLimit-Reset` — ISO 8601 timestamp when the limit resets

## Monitoring and Observability

### In-Memory Store Limitations

The current implementation uses an in-memory store, which has these characteristics:

- **Single-instance:** Each Next.js instance (development, local, or serverless) maintains its own rate limit state.
- **Not distributed:** In Vercel or multi-instance deployments, clients hitting different instances will get separate rate limit buckets.
- **Stateless across restarts:** Rate limit state is lost when the server restarts or the function is cold-started in serverless.

These trade-offs are acceptable for the current threat model because:
1. **Brute force attacks** typically hammer a single endpoint consistently, hitting the same instance.
2. **Legitimate traffic** is distributed across instances naturally, allowing each instance to handle ~30-60 requests/min independently.
3. **Backup:** Supabase Auth already enforces rate limits server-side for `exchangeCodeForSession`, providing defense-in-depth.

### Production Upgrade Path

If you need distributed rate limiting across multiple instances:

1. **Vercel KV (Recommended):** Deploy with `npm install @vercel/kv` and modify `lib/rate-limit.ts` to use KV instead of in-memory Map. This requires:
   - Setting `VERCEL_KV_URL` and `VERCEL_KV_REST_API_TOKEN` in Vercel environment
   - Async refactor of the `RateLimiter` class
   - Cost: $0.40/month base + $0.02 per 1M read/write ops

2. **Redis (Alternative):** Use ioredis or redis-js library with a managed Redis instance (AWS ElastiCache, Upstash, etc.)

3. **Database (Legacy):** Use Supabase as a persistent store with a periodic cleanup job, but this adds query overhead to every request.

## Development and Testing

### Local Testing

Rate limits are enforced on `localhost`. To test:

```bash
# Terminal 1: Start the dev server
npm run dev

# Terminal 2: Hammer the auth callback
for i in {1..6}; do
  curl "http://localhost:3000/auth/callback?code=test&next=/" 2>/dev/null | grep -o "error.*" | head -1
  sleep 0.5
done
```

Expected behavior:
- Requests 1-5: Pass through to the auth handler (fail because code is invalid, but no 429)
- Request 6: Returns 429 "Too many authentication attempts"

### Disabling Rate Limiting (Development Only)

To temporarily disable rate limiting during development, modify `lib/rate-limit.ts`:

```typescript
export const authRateLimiter = new RateLimiter({
  maxRequests: Number.MAX_SAFE_INTEGER, // Disable
  windowMs: 60 * 1000,
});
```

**Never commit this change to main.**

## Maintenance

### Periodic Review

- **Monthly:** Check logs (Vercel Edge Logs) for 429 response rates. Legitimate users should rarely hit limits.
- **Quarterly:** Review thresholds based on traffic patterns and user complaints.
- **On incident:** If an attack targets a specific endpoint, temporarily increase the limit or upgrade to distributed KV.

### Threshold Adjustment

To modify limits, edit `lib/rate-limit.ts` and redeploy:

```typescript
export const authRateLimiter = new RateLimiter({
  maxRequests: 10,        // Increase from 5
  windowMs: 10 * 60 * 1000, // Expand window to 10 minutes
});
```

Changes take effect on next deployment (no restart needed for in-memory state).

## Security Considerations

### IP Spoofing

The rate limiter extracts client IP from request headers in this order:
1. `X-Forwarded-For` (leftmost IP for multiple proxies)
2. `X-Real-IP`
3. Direct connection IP (localhost fallback)

**Vercel sets these headers correctly** and proxies requests through its own infrastructure, so spoofing is not a practical concern in production. In local development, the fallback to `127.0.0.1` ensures all requests are rate-limited equally.

### Distributed Attacks

A distributed attack (1 request from 1000 different IPs) will bypass per-IP rate limiting by design. Mitigations:

1. **Supabase Auth RLS:** The `exchangeCodeForSession` endpoint has built-in Supabase rate limits and requires a valid secret key.
2. **Vercel Edge Config/WAF:** For advanced DDoS protection, enable Vercel's built-in WAF rules.
3. **Cloudflare:** If using Cloudflare as a CDN, enable rate limiting rules at the edge.

## Related Issues

- **[JGF-50](/JGF/issues/JGF-50):** Security audit baseline (parent)
- **[JGF-1551](/JGF/issues/JGF-1551):** This implementation (current)

## References

- [RFC 6585 – HTTP 429 Too Many Requests](https://tools.ietf.org/html/rfc6585)
- [Vercel KV Documentation](https://vercel.com/docs/storage/vercel-kv)
- [OWASP Rate Limiting Guide](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Prevention_Cheat_Sheet.html)
