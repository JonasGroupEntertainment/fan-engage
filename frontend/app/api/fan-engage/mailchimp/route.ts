import { NextResponse, type NextRequest } from "next/server";
import { fanDataRateLimiter, getClientIp } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRecordedEmailConsent } from "@/lib/marketing-consent";

export const runtime = "nodejs";

const ALLOWED_TAGS = ["fan", "early-access", "vip", "newsletter"] as const;
type AllowedTag = (typeof ALLOWED_TAGS)[number];

type SubscribePayload = {
  /** Ignored. The address is the signed-in fan's own account email. */
  email?: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
};

/**
 * Subscribes the signed-in fan to the configured Mailchimp audience.
 *
 * The audience is for marketing email, so only a fan with a recorded
 * email consent is added (lib/marketing-consent.ts). The consent and the
 * address are read on the server: the address is the account email, and a
 * posted email is not trusted, so nobody can subscribe someone else.
 *
 * Uses PUT /lists/{id}/members/{subscriber_hash} which is an upsert —
 * calling it twice with the same email is safe.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientIp = getClientIp(request.headers);
  const rateLimitResult = fanDataRateLimiter.check(clientIp);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      {
        error: "Too many subscription requests. Please try again later.",
        retryAfter: Math.ceil(
          (rateLimitResult.resetTime.getTime() - Date.now()) / 1000,
        ),
      },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(
            (rateLimitResult.resetTime.getTime() - Date.now()) / 1000,
          ).toString(),
          "X-RateLimit-Limit": rateLimitResult.limit.toString(),
          "X-RateLimit-Remaining": rateLimitResult.remaining.toString(),
          "X-RateLimit-Reset": rateLimitResult.resetTime.toISOString(),
        },
      },
    );
  }
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const server = process.env.MAILCHIMP_SERVER_PREFIX;
  const listId = process.env.MAILCHIMP_AUDIENCE_ID;

  if (!apiKey || !server || !listId) {
    return NextResponse.json(
      {
        error:
          "Mailchimp is not configured yet. Set MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, and MAILCHIMP_AUDIENCE_ID.",
      },
      { status: 503 },
    );
  }

  try {
    const { firstName, lastName, tags } =
      (await request.json()) as SubscribePayload;

    const email = user.email?.trim();
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    // Read with the service role, scoped to this fan. If the consent
    // columns do not exist yet (migration 0109), the read fails and the fan
    // is not added: no record, no mailing list.
    const { data: consentRow, error: consentErr } = await createAdminClient()
      .from("fans")
      .select("email_opted_in, email_consent_at")
      .eq("id", user.id)
      .maybeSingle();
    if (consentErr) {
      console.error("mailchimp subscribe: consent read failed", { code: consentErr.code });
      return NextResponse.json({ skipped: "no-email-consent" }, { status: 200 });
    }
    if (!hasRecordedEmailConsent(consentRow)) {
      return NextResponse.json({ skipped: "no-email-consent" }, { status: 200 });
    }

    const subscriberHash = await md5Lowercase(email);
    const url = `https://${server}.api.mailchimp.com/3.0/lists/${listId}/members/${subscriberHash}`;

    const body: Record<string, unknown> = {
      email_address: email,
      status_if_new: "subscribed",
      merge_fields: {
        ...(firstName ? { FNAME: firstName } : {}),
        ...(lastName ? { LNAME: lastName } : {}),
      },
    };
    const safeTags: AllowedTag[] = (tags ?? []).filter((t): t is AllowedTag =>
      ALLOWED_TAGS.includes(t as AllowedTag)
    );
    if (safeTags.length > 0) body.tags = safeTags;

    const authHeader = `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      console.error("Mailchimp subscribe failed:", res.status, detail);
      return NextResponse.json(
        { error: "Unable to subscribe to audience.", detail },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mailchimp route error:", error);
    return NextResponse.json(
      { error: "Unable to subscribe to audience." },
      { status: 500 },
    );
  }
}

/** Mailchimp subscriber hash = lowercased-email md5. Uses built-in WebCrypto. */
async function md5Lowercase(email: string): Promise<string> {
  // Node crypto — works in Next.js nodejs runtime.
  const { createHash } = await import("node:crypto");
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}
