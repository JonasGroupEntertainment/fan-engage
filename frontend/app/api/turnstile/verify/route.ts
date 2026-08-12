import { NextResponse, type NextRequest } from "next/server";
import { authRateLimiter, getClientIp } from "@/lib/rate-limit";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** When unset/false, upstream/network failures fail-open so auth isn't hard-blocked. */
function failOpenEnabled() {
  const v = process.env.TURNSTILE_FAIL_OPEN;
  if (v === "0" || v === "false" || v === "off") return false;
  return true; // default: fail-open on Cloudflare outages
}

function failOpenResponse(reason: string, detail?: unknown) {
  console.error(`[turnstile] ${reason} — failing open`, detail ?? "");
  return NextResponse.json({ success: true, failedOpen: true, error: reason });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = authRateLimiter.check(ip ?? "unknown");
  if (!rl.success) {
    return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // If Turnstile isn't configured yet, let requests through (dev/staging).
    // Set TURNSTILE_SECRET_KEY in production to enforce.
    return NextResponse.json({ success: true });
  }

  let token: string | undefined;
  try {
    const body = await request.json();
    token = typeof body.token === "string" ? body.token : undefined;
  } catch {
    return NextResponse.json({ success: false, error: "invalid_body" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ success: false, error: "missing_token" }, { status: 400 });
  }

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  let res: Response;
  try {
    res = await fetch(VERIFY_URL, {
      method: "POST",
      body: form,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch (err) {
    if (failOpenEnabled()) {
      return failOpenResponse("network_error", err);
    }
    return NextResponse.json({ success: false, error: "network_error" }, { status: 502 });
  }

  if (!res.ok) {
    if (failOpenEnabled()) {
      return failOpenResponse("upstream_error", { status: res.status });
    }
    return NextResponse.json({ success: false, error: "upstream_error" }, { status: 502 });
  }

  let data: { success: boolean; "error-codes"?: string[] };
  try {
    data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
  } catch (err) {
    if (failOpenEnabled()) {
      return failOpenResponse("upstream_error", err);
    }
    return NextResponse.json({ success: false, error: "upstream_error" }, { status: 502 });
  }

  if (!data.success) {
    // Real challenge failures stay fail-closed when keys are configured.
    return NextResponse.json(
      { success: false, error: data["error-codes"]?.[0] ?? "challenge_failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({ success: true });
}
