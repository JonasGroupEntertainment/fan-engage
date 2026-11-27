import { NextResponse } from "next/server";
import { clientErrorRateLimiter, getClientIp } from "@/lib/rate-limit";
import { parseClientErrorReport } from "@/lib/client-error-report";
import { clientErrorRow } from "@/lib/app-error-row";
import { recordAppError } from "@/lib/app-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Writes one line to the server log for an error a fan's browser hit
 *. Sent with navigator.sendBeacon from
 * app/error.tsx and app/global-error.tsx, so the answer is never read.
 * The line lands in the Vercel runtime logs and in app_errors (0114).
 */
export async function POST(request: Request) {
  const rl = clientErrorRateLimiter.check(`client-error:${getClientIp(request.headers)}`);
  if (!rl.success) return new NextResponse(null, { status: 429 });

  const report = parseClientErrorReport(await request.text().catch(() => ""));
  if (report) {
    console.error("[client-error]", JSON.stringify(report));
    await recordAppError(clientErrorRow(report));
  }
  return new NextResponse(null, { status: 204 });
}
