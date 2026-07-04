import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/influencers/[id]/promo-codes
 * POST /api/admin/influencers/[id]/promo-codes — create promo code for influencer
 *
 * Protected by admin auth.
 */

async function requireAdmin() {
  const ctx = await getAdminContext();
  if (!ctx) throw new Error("Unauthorized");
  return ctx;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id: influencerId } = await params;

    const db = createAdminClient();
    const { data, error } = await db
      .from("influencer_promo_codes")
      .select(
        "id, influencer_id, code, discount_type, discount_value, max_redemptions, current_redemptions, created_at",
      )
      .eq("influencer_id", influencerId)
      .order("created_at", { ascending: false });

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id: influencerId } = await params;
    const body = await request.json();
    const { code, discount_type, discount_value, max_redemptions } = body;

    if (!code || !discount_type || discount_value === undefined) {
      return NextResponse.json(
        { ok: false, error: "code, discount_type, and discount_value are required" },
        { status: 400 },
      );
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("influencer_promo_codes")
      .insert({
        influencer_id: influencerId,
        code: code.toUpperCase(),
        discount_type,
        discount_value,
        max_redemptions: max_redemptions || null,
        current_redemptions: 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: "Database error" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error && err.message === "Unauthorized" ? "Unauthorized" : "Request failed" },
      { status: 401 },
    );
  }
}
