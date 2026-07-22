/**
 * Simple in-memory rate limiter for Next.js API routes.
 * Tracks requests per IP address with a sliding window approach.
 * Works both in Vercel Edge and Node.js runtimes.
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitRecord>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (record.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Check if request is within rate limit.
   * Returns { success: boolean, limit: number, remaining: number, resetTime: Date }
   */
  check(identifier: string): {
    success: boolean;
    limit: number;
    remaining: number;
    resetTime: Date;
  } {
    const now = Date.now();
    let record = this.store.get(identifier);

    // Initialize or reset if window expired
    if (!record || record.resetTime < now) {
      record = { count: 0, resetTime: now + this.config.windowMs };
      this.store.set(identifier, record);
    }

    record.count++;

    return {
      success: record.count <= this.config.maxRequests,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - record.count),
      resetTime: new Date(record.resetTime),
    };
  }
}

// Create global instances for different rate limit tiers
export const authRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 15 * 60 * 1000, // 10 attempts per 15 minutes
});

// Magic-link / email-confirmation callback. Deliberately NOT shared with
// authRateLimiter: a user's failed Turnstile attempts must never consume the
// budget that their emailed sign-in link needs to complete.
export const callbackRateLimiter = new RateLimiter({
  maxRequests: 20,
  windowMs: 15 * 60 * 1000, // 20 attempts per 15 minutes
});

export const fanDataRateLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60 * 1000, // 30 requests per minute
});

export const apiRateLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60 * 1000, // 60 requests per minute
});

/**
 * Extract client IP from request headers.
 * Handles X-Forwarded-For (proxy/Vercel) and direct connection.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }

  const realIp = headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  // Fallback for direct connections (localhost dev)
  return "127.0.0.1";
}
