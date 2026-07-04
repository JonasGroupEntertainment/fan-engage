import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recordCheckin } from "@/lib/data/checkins";
import { apiRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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
  if (!artistSlug) {
    return NextResponse.json({ error: "artist_slug required" }, { status: 400 });
  }

  const result = await recordCheckin(user.id, artistSlug);
  return NextResponse.json(result, { status: 200 });
}
