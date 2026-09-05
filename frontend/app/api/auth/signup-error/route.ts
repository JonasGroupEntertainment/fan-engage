import { NextResponse, type NextRequest } from "next/server";
import { authRateLimitSalt } from "@/lib/auth-rate-limit-policy";
import { getClientIp } from "@/lib/rate-limit";
import { checkSharedRateLimit } from "@/lib/shared-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receives the raw GoTrue/Postgres signup error so it can be logged
 * server-side. The JSON body is never echoed back to the client.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  let rl;
  try {
    rl = await checkSharedRateLimit({
      scope: "signup-error",
      identifier: ip ?? "unknown",
      salt: authRateLimitSalt(process.env),
      limit: 10,
      windowSeconds: 15 * 60,
    });
  } catch (error) {
    console.error("[signup] rate limit unavailable", error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  if (!rl.success) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let message = "";
  let code: string | null = null;
  try {
    const body = (await request.json()) as { message?: unknown; code?: unknown };
    if (typeof body.message === "string") message = body.message.slice(0, 300);
    if (typeof body.code === "string" && body.code.trim()) {
      code = body.code.trim().slice(0, 80);
    }
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (message || code) {
    console.error("[signup] create failed", { code, message });
  }

  return NextResponse.json({ ok: true });
}
