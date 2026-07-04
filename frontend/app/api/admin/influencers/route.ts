import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/influencers?artist_slug=<slug>
 * POST /api/admin/influencers — create or update influencer
 *
 * Protected by admin auth.
 */

async function requireAdminContext() {
  const ctx = await getAdminContext();
  if (!ctx) throw new Error("Unauthorized");
  return ctx;
}

export async function GET(request: Request) {
  try {
    const ctx = await requireAdminContext();
    const { searchParams } = new URL(request.url);
    const artistSlug = searchParams.get("artist_slug");

    // Non-super-admins can only see their own community's influencers
    const scopedSlug = ctx.isSuperAdmin ? artistSlug : ctx.currentCommunityId;

    const db = createAdminClient();
    let query = db
      .from("influencers")
      .select("id, handle, platform, real_name, artist_slug, status, created_at");

    if (scopedSlug) {
      query = query.eq("artist_slug", scopedSlug);
    } else if (!ctx.isSuperAdmin) {
      return NextResponse.json({ ok: false, error: "No community selected" }, { status: 403 });
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error && err.message === "Unauthorized" ? "Unauthorized" : "Request failed" },
      { status: 401 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireAdminContext();
    const body = await request.json();
    const { id, handle, platform, real_name, artist_slug, status } = body;

    if (!handle || !platform || !artist_slug) {
      return NextResponse.json(
        { ok: false, error: "handle, platform, and artist_slug are required" },
        { status: 400 },
      );
    }

    // Non-super-admins can only manage their own community
    if (!ctx.isSuperAdmin && artist_slug !== ctx.currentCommunityId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const db = createAdminClient();

    if (id) {
      // Update existing
      const { data, error } = await db
        .from("influencers")
        .update({ handle, platform, real_name, artist_slug, status: status || "active" })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ ok: false, error: "Database error" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data });
    } else {
      // Create new
      const { data, error } = await db
        .from("influencers")
        .insert({
          handle,
          platform,
          real_name: real_name || null,
          artist_slug,
          status: status || "active",
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ ok: false, error: "Database error" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data }, { status: 201 });
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error && err.message === "Unauthorized" ? "Unauthorized" : "Request failed" },
      { status: 401 },
    );
  }
}
