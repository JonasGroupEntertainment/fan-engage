import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestCaptions, CaptionError } from "@/lib/captions";
import { apiRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/caption-image
 * Body: { imageUrl: string, partialBody?: string, artistSlug?: string }
 *
 * Auth-gated. Returns 3 caption suggestions for the given image.
 * The route looks up community context (name, tagline, genres) by
 * artistSlug if provided, so the model can match tone to the
 * community vibe.
 *
 * Failure modes:
 *   401 — not signed in
 *   400 — missing or malformed imageUrl
 *   503 — ANTHROPIC_API_KEY not configured / Anthropic API down
 *   500 — anything else (logged for debugging)
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to use the caption suggester." },
      { status: 401 },
    );
  }

  const rl = apiRateLimiter.check(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 },
    );
  }

  let body: { imageUrl?: string; partialBody?: string; artistSlug?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const imageUrl = (body?.imageUrl ?? "").trim();
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    return NextResponse.json(
      { error: "imageUrl is required and must be http(s)." },
      { status: 400 },
    );
  }
  // Restrict fetches to trusted storage/CDN hosts to prevent SSRF
  try {
    const { hostname } = new URL(imageUrl);
    const allowed = /\.(supabase\.co|supabase\.in|cloudinary\.com|imgix\.net|fanengagepro\.com)$/i;
    if (!allowed.test(hostname)) {
      return NextResponse.json(
        { error: "imageUrl host is not allowed." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Invalid imageUrl." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Caption suggester unavailable — API key not configured." },
      { status: 503 },
    );
  }

  // Pull community context if artistSlug was provided. Soft-fail —
  // missing context just means a slightly more generic prompt.
  let communityName: string | undefined;
  let communityTagline: string | null | undefined;
  if (body.artistSlug) {
    const { data: community } = await supabase
      .from("communities")
      .select("display_name, tagline")
      .eq("slug", body.artistSlug)
      .maybeSingle();
    if (community) {
      communityName = community.display_name as string;
      communityTagline = community.tagline as string | null;
    }
  }

  try {
    const captions = await suggestCaptions({
      imageUrl,
      partialBody: body.partialBody,
      communityName,
      communityTagline,
    });
    return NextResponse.json(
      { captions },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
    );
  } catch (err) {
    if (err instanceof CaptionError) {
      console.error("[/api/ai/caption-image] CaptionError:", err.message);
      return NextResponse.json(
        { error: "Caption suggester is having trouble — please try again." },
        { status: 503 },
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/ai/caption-image] failed:", msg);
    return NextResponse.json({ error: "Caption suggester failed." }, { status: 500 });
  }
}
