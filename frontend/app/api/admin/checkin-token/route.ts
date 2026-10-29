import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin";
import { getPortalContext, roleAtLeast, PORTAL_MIN_ROLE } from "@/lib/artist-portal/access";
import { mintCheckinToken } from "@/lib/checkin-token";
import { APP_URL } from "@/lib/app-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/checkin-token?artist=<slug>
 *
 * Mints the current check-in URL for the artist-portal QR display, which
 * re-fetches it as the token rotates (see lib/checkin-token.ts).
 *
 * Gated with the artist-portal role matrix: editor and above on the
 * artist's own community (PORTAL_MIN_ROLE.checkinQr); a super-admin
 * (admin_users community_id = '*') may mint for any artist. Everyone else
 * gets 403/404 (404 so the route does not confirm which slugs exist).
 *
 * 200 → { url, path, token, expiresAt, rotationSeconds, rotation }
 *   - rotation is "off" (token/expiresAt null, static url) until
 *     CHECKIN_TOKEN_SECRET is set and CHECKIN_TOKEN_ROTATION is not "off".
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const artist = (searchParams.get("artist") ?? "").trim().toLowerCase();
  if (!artist) {
    return NextResponse.json({ error: "artist is required" }, { status: 400 });
  }

  const ctx = await getPortalContext();
  if (!ctx) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ownCommunity =
    ctx.communityId === artist && roleAtLeast(ctx.role, PORTAL_MIN_ROLE.checkinQr);
  if (!ownCommunity) {
    const adminCtx = await getAdminContext().catch(() => null);
    if (!adminCtx?.isSuperAdmin) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const mint = mintCheckinToken(artist);
  return NextResponse.json(
    { url: `${APP_URL}${mint.path}`, ...mint },
    { headers: { "Cache-Control": "no-store" } },
  );
}
