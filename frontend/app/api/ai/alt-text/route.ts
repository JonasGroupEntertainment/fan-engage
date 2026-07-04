/**
 * POST /api/ai/alt-text
 *
 * Body: { imageUrl: string, artistSlug?: string, partialBody?: string }
 * Returns: { altText: string } — empty string on failure (UI handles)
 *
 * Auth: requires logged-in fan.
 * Rate limit: 1 call / 2s per user (vision is more expensive).
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAltText } from "@/lib/alt-text/generate";
import { apiRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_WINDOW_MS = 2000;
const lastCallByUser = new Map<string, number>();

interface RequestBody {
  imageUrl?: unknown;
  artistSlug?: unknown;
  partialBody?: unknown;
}

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = userRes.user.id;

  const rl = apiRateLimiter.check(userId);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 },
    );
  }

  const last = lastCallByUser.get(userId) ?? 0;
  const now = Date.now();
  if (now - last < RATE_WINDOW_MS) {
    return NextResponse.json({ altText: "" });
  }
  lastCallByUser.set(userId, now);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
  const artistSlug =
    typeof body.artistSlug === "string" && body.artistSlug.trim().length > 0
      ? body.artistSlug.trim()
      : undefined;
  const partialBody =
    typeof body.partialBody === "string" ? body.partialBody : "";

  if (!imageUrl) {
    return NextResponse.json({ altText: "" });
  }
  // Restrict fetches to trusted storage/CDN hosts to prevent SSRF
  try {
    const { hostname } = new URL(imageUrl);
    const allowed = /\.(supabase\.co|supabase\.in|cloudinary\.com|imgix\.net|fanengagepro\.com)$/i;
    if (!allowed.test(hostname)) {
      return NextResponse.json({ altText: "" });
    }
  } catch {
    return NextResponse.json({ altText: "" });
  }

  // Lookup artist name for context (best-effort)
  let artistName: string | null = null;
  if (artistSlug) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("artists")
        .select("name")
        .eq("slug", artistSlug)
        .maybeSingle();
      artistName = (data as { name?: string | null } | null)?.name ?? null;
    } catch {
      // best-effort
    }
  }

  const altText = await generateAltText({
    image_url: imageUrl,
    artist_or_brand_name: artistName,
    partial_body: partialBody,
  });

  return NextResponse.json({ altText });
}
