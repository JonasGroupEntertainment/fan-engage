import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import { validateInfluencerPromo } from "@/lib/influencer-promo-limits";

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

/**
 * The caller must administer the influencer's artist community. Loaded
 * from the database, never from the request. Returns an error response
 * or null when allowed.
 */
async function influencerAccessError(
  ctx: NonNullable<Awaited<ReturnType<typeof getAdminContext>>>,
  influencerId: string,
): Promise<NextResponse | null> {
  const { data } = await createAdminClient()
    .from("influencers")
    .select("artist_slug")
    .eq("id", influencerId)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const guard = await authorizeAdmin({ communityId: String(data.artist_slug), minRole: "admin" }, ctx);
  if (!guard.ok) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAdmin();
    const { id: influencerId } = await params;
    const denied = await influencerAccessError(ctx, influencerId);
    if (denied) return denied;

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
    const ctx = await requireAdmin();
    const { id: influencerId } = await params;
    const denied = await influencerAccessError(ctx, influencerId);
    if (denied) return denied;
    const body = await request.json();
    const { code, discount_type, discount_value, max_redemptions } = body;

    if (!code || typeof code !== "string" || !discount_type || discount_value === undefined) {
      return NextResponse.json(
        { ok: false, error: "code, discount_type, and discount_value are required" },
        { status: 400 },
      );
    }
    const checked = validateInfluencerPromo({
      discountType: discount_type,
      discountValue: discount_value,
      maxRedemptions: max_redemptions,
    });
    if (!checked.ok) {
      return NextResponse.json({ ok: false, error: checked.error }, { status: 400 });
    }

    const db = createAdminClient();
    const { data, error } = await db
      .from("influencer_promo_codes")
      .insert({
        influencer_id: influencerId,
        code: code.toUpperCase(),
        discount_type: checked.value.discountType,
        discount_value: checked.value.discountValue,
        max_redemptions: checked.value.maxRedemptions,
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
