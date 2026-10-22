import { runCron } from "@/lib/cron-run";
/**
 * /api/cron/alt-text-backfill (FE)
 *
 * Generates alt text for posts that have image_url but no image_alt.
 * Capped at 10 posts per tick to bound cost. Runs every 15 minutes
 * via vercel.json. Steady-state cost is zero (no rows match → no work).
 *
 * Auth: Bearer $CRON_SECRET (Vercel cron sends this automatically).
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateAltText } from "@/lib/alt-text/generate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PER_TICK = 10;

interface PostRow {
  id: string;
  image_url: string;
  body: string | null;
  artist_slug: string | null;
}

interface RunResult {
  ok: boolean;
  scanned: number;
  generated: number;
  skipped_empty: number;
  errors: number;
  details: Array<{
    id: string;
    outcome: "generated" | "empty" | "error";
    note?: string;
  }>;
}

export async function GET(request: Request) {
  return runCron(request, "alt-text-backfill", () => altTextBackfill());
}

async function altTextBackfill() {
  const admin = createAdminClient();

  // Find posts with images but no alt text
  const { data: posts, error: queryErr } = await admin
    .from("community_posts")
    .select("id, image_url, image_alt, body, artist_slug")
    .not("image_url", "is", null)
    .is("image_alt", null)
    .order("created_at", { ascending: false })
    .limit(MAX_PER_TICK);

  if (queryErr) {
    return NextResponse.json(
      { ok: false, error: "query_failed", detail: queryErr.message },
      { status: 500 },
    );
  }

  const result: RunResult = {
    ok: true,
    scanned: 0,
    generated: 0,
    skipped_empty: 0,
    errors: 0,
    details: [],
  };

  // Cache artist names per slug to avoid duplicate lookups
  const artistNameCache = new Map<string, string | null>();

  for (const row of (posts ?? []) as PostRow[]) {
    result.scanned += 1;

    if (!row.image_url) {
      result.skipped_empty += 1;
      result.details.push({ id: row.id, outcome: "empty", note: "no image_url" });
      continue;
    }

    try {
      // Lookup artist name (cached)
      let artistName: string | null = null;
      if (row.artist_slug) {
        if (artistNameCache.has(row.artist_slug)) {
          artistName = artistNameCache.get(row.artist_slug) ?? null;
        } else {
          const { data: a } = await admin
            .from("artists")
            .select("name")
            .eq("slug", row.artist_slug)
            .maybeSingle();
          artistName = (a as { name?: string | null } | null)?.name ?? null;
          artistNameCache.set(row.artist_slug, artistName);
        }
      }

      const altText = await generateAltText({
        image_url: row.image_url,
        artist_or_brand_name: artistName,
        partial_body: row.body ?? "",
      });

      if (!altText) {
        result.skipped_empty += 1;
        result.details.push({
          id: row.id,
          outcome: "empty",
          note: "vision returned empty",
        });
        continue;
      }

      const { error: updateErr } = await admin
        .from("community_posts")
        .update({ image_alt: altText })
        .eq("id", row.id);

      if (updateErr) throw updateErr;

      result.generated += 1;
      result.details.push({ id: row.id, outcome: "generated" });
    } catch (err) {
      result.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[cron alt-text-backfill] failed for", row.id, msg);
      result.details.push({ id: row.id, outcome: "error", note: msg });
    }
  }

  return NextResponse.json(result);
}
