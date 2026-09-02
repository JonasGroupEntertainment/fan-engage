import { NextResponse, type NextRequest } from "next/server";
import { authRateLimiter, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receives the raw GoTrue/Postgres signup error so it can be logged
 * server-side. The JSON body is never echoed back to the client.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rl = authRateLimiter.check(ip ?? "unknown");
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
