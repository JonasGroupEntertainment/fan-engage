import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordCheckin } from "@/lib/data/checkins";
import { apiRateLimiter } from "@/lib/rate-limit";
import { withPointsProgress } from "@/lib/points/lifetime";
import {
  CHECKIN_TOKEN_EXPIRED_CODE,
  CHECKIN_TOKEN_EXPIRED_MESSAGE,
  CHECKIN_TOKEN_REQUIRED_MESSAGE,
  checkinTokenDecision,
} from "@/lib/checkin-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let warnedRotationOff = false;

/**
 * POST /api/checkin
 * Body: { artist_slug: string, token?: string }
 *
 * `token` is the HMAC from the venue QR (see lib/checkin-token.ts). When
 * rotation is on (CHECKIN_TOKEN_SECRET set and CHECKIN_TOKEN_ROTATION not
 * "off") it is required; a rotated-out token gets 403
 * { error: "expired_code" } so the landing page can say "scan the live QR
 * again". When rotation is off — the default until the env vars are set —
 * the token is ignored, the static /artists/<slug>/checkin URL keeps
 * working, and one warning is logged per process.
 *
 * 200 → { alreadyCheckedIn, pointsAwarded, lifetimePoints, nextTier }
 *   lifetimePoints / nextTier are the "progress at action" payload
 *   (lib/points/progress.ts) so the landing page can say
 *   "+25 pts · N to Gold". Best-effort: never fails the check-in.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = apiRateLimiter.check(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const artistSlug = typeof body.artist_slug === "string" ? body.artist_slug.trim() : "";
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!artistSlug) {
    return NextResponse.json({ error: "artist_slug required" }, { status: 400 });
  }

  const decision = checkinTokenDecision(artistSlug, token);
  if (!decision.allow) {
    if (decision.reason === "expired") {
      return NextResponse.json(
        { error: CHECKIN_TOKEN_EXPIRED_CODE, message: CHECKIN_TOKEN_EXPIRED_MESSAGE },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: CHECKIN_TOKEN_REQUIRED_MESSAGE }, { status: 403 });
  }
  if (decision.reason === "rotation_off" && !warnedRotationOff) {
    warnedRotationOff = true;
    console.warn(
      "[checkin] rotation is off (CHECKIN_TOKEN_SECRET unset or CHECKIN_TOKEN_ROTATION=off); check-in tokens are not verified.",
    );
  }

  const { result, progress } = await withPointsProgress(user.id, () =>
    recordCheckin(user.id, artistSlug),
  );
  return NextResponse.json(
    {
      ...result,
      // recordCheckin's figure is authoritative; the lifetime diff only
      // confirms it (and reads 0 before migration 0085 is applied).
      lifetimePoints: progress.lifetimePoints,
      nextTier: progress.nextTier,
    },
    { status: 200 },
  );
}
