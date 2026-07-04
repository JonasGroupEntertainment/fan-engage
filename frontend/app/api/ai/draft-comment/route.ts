import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { draftComment } from "@/lib/drafts";
import { apiRateLimiter } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ai/draft-comment
 * Body: { postId: string }
 *
 * Returns 3 reply drafts the user can pick + edit. Auth-gated — only
 * signed-in users can call this. The user's own auth.uid() is used as
 * the userId for fetching their prior comment style.
 *
 * Failure modes:
 *   401 — not signed in
 *   400 — missing postId
 *   503 — ANTHROPIC_API_KEY not set
 *   500 — anything else (logged for debugging)
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to use the drafter." }, { status: 401 });
  }

  const rl = apiRateLimiter.check(user.id);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429 },
    );
  }

  let body: { postId?: string };
  try {
    body = (await request.json()) as { postId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const postId = (body?.postId ?? "").trim();
  if (!postId) {
    return NextResponse.json({ error: "Missing postId." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Drafter is unavailable — API key not configured." },
      { status: 503 },
    );
  }

  const result = await draftComment({ postId, userId: user.id });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json(
    { drafts: result.drafts },
    {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    },
  );
}
