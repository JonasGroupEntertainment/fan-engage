/**
 * POST /api/ai/suggest-tags
 *
 * Body: { partialBody: string, artistSlug?: string }
 * Returns: { tags: string[] }
 *
 * Auth: requires logged-in fan (auth.getUser via server client).
 * Rate limit: lightweight in-memory bucket (1 call / 1.5s per user).
 *   Survives a single Vercel instance only — that's fine; this isn't
 *   abuse-resistance, it's a courtesy debounce in case the UI hammers.
 */

import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { suggestTagsFromBody } from "@/lib/tagging/suggest";
import { apiRateLimiter } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_WINDOW_MS = 1500;
const lastCallByUser = new Map<string, number>();

interface RequestBody {
  partialBody?: unknown;
  artistSlug?: unknown;
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
    return NextResponse.json({ tags: [] }, { status: 200 });
  }
  lastCallByUser.set(userId, now);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const partialBody = typeof body.partialBody === "string" ? body.partialBody : "";
  const artistSlug =
    typeof body.artistSlug === "string" && body.artistSlug.trim().length > 0
      ? body.artistSlug.trim()
      : undefined;

  if (partialBody.trim().length < 12) {
    return NextResponse.json({ tags: [] });
  }

  // Pull top existing tags for this artist as taxonomy nudge
  let existing_tags: string[] | undefined;
  if (artistSlug) {
    try {
      const admin = createAdminClient();
      const { data: tagRows } = await admin
        .from("community_posts")
        .select("tags")
        .eq("artist_slug", artistSlug)
        .not("tags", "is", null)
        .limit(200);
      if (tagRows && tagRows.length > 0) {
        const counts = new Map<string, number>();
        for (const row of tagRows) {
          const arr = (row as { tags?: string[] | null }).tags ?? [];
          for (const t of arr) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
          }
        }
        existing_tags = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([t]) => t);
      }
    } catch {
      // best-effort; don't fail the suggestion
    }
  }

  const tags = await suggestTagsFromBody({
    partial_body: partialBody,
    artist_slug: artistSlug,
    existing_tags,
  });

  return NextResponse.json({ tags });
}
