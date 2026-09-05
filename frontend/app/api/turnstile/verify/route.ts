import { NextResponse, type NextRequest } from "next/server";
import { authRateLimitSalt } from "@/lib/auth-rate-limit-policy";
import { getClientIp } from "@/lib/rate-limit";
import { checkSharedRateLimit } from "@/lib/shared-rate-limit";
import { turnstileUpstreamFailOpen } from "@/lib/turnstile-verify-policy";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failOpenResponse(reason: string, detail?: unknown) {
  console.error(`[turnstile] ${reason} — failing open`, detail ?? "");
  return NextResponse.json({ success: true, failedOpen: true, error: reason });
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  let rl;
  try {
    rl = await checkSharedRateLimit({
      scope: "turnstile-verify",
      identifier: ip ?? "unknown",
      salt: authRateLimitSalt(process.env),
      limit: 10,
      windowSeconds: 15 * 60,
    });
  } catch (error) {
    console.error("[turnstile] rate limit unavailable", error);
    return NextResponse.json(
      { success: false, error: "rate_limit_unavailable" },
      { status: 503 },
    );
  }

  if (!rl.allowed) {
    if (rl.reason === "backend_unavailable") {
      return NextResponse.json(
        { success: false, error: "rate_limit_unavailable" },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: false, error: "rate_limited" }, { status: 429 });
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // If Turnstile isn't configured yet, let requests through (dev/staging).
    // Set TURNSTILE_SECRET_KEY in production to enforce.
    return NextResponse.json({ success: true });
  }

  let token: string | undefined;
  let failClosedRequest = false;
  try {
    const body = await request.json();
    token = typeof body.token === "string" ? body.token : undefined;
    failClosedRequest = body.failClosed === true;
  } catch {
    return NextResponse.json({ success: false, error: "invalid_body" }, { status: 400 });
  }

  if (!token) {
    return NextResponse.json({ success: false, error: "missing_token" }, { status: 400 });
  }

  const allowUpstreamFailOpen = turnstileUpstreamFailOpen({
    failOpenEnv: process.env.TURNSTILE_FAIL_OPEN,
    failClosedRequest,
    vercelEnv: process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV,
  });

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
    if (allowUpstreamFailOpen) {
      return failOpenResponse("network_error", err);
    }
    return NextResponse.json({ success: false, error: "network_error" }, { status: 502 });
  }

  if (!res.ok) {
    if (allowUpstreamFailOpen) {
      return failOpenResponse("upstream_error", { status: res.status });
    }
    return NextResponse.json({ success: false, error: "upstream_error" }, { status: 502 });
  }

  let data: { success: boolean; "error-codes"?: string[] };
  try {
    data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
  } catch (err) {
    if (allowUpstreamFailOpen) {
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
