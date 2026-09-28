"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import { validateInfluencerPromo } from "@/lib/influencer-promo-limits";

const FORBIDDEN = { error: "You do not manage this artist." } as const;

async function canManageArtist(artistSlug: string): Promise<boolean> {
  const guard = await authorizeAdmin({ communityId: artistSlug, minRole: "admin" });
  return guard.ok;
}

async function influencerArtist(influencerId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("influencers")
    .select("artist_slug")
    .eq("id", influencerId)
    .maybeSingle();
  return (data?.artist_slug as string | undefined) ?? null;
}

/**
 * Create a new influencer for an artist.
 * Returns { success, id } on success or { error } on failure.
 */
export async function createInfluencerAction(formData: FormData) {
  const handle = String(formData.get("handle") ?? "").trim();
  const platform = String(formData.get("platform") ?? "").trim();
  const realName = String(formData.get("real_name") ?? "").trim();
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();

  if (!handle || !platform || !artistSlug) {
    return { error: "Handle, platform, and artist are required." };
  }
  if (!(await canManageArtist(artistSlug))) return FORBIDDEN;

  const supa = createAdminClient();
  const { data, error } = await supa
    .from("influencers")
    .insert({
      handle,
      platform,
      real_name: realName || null,
      artist_slug: artistSlug,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/influencers");
  return { success: true as const, id: data.id };
}

/**
 * Create a promo code for an influencer.
 * Returns { success, code } on success or { error } on failure.
 */
export async function createPromoCodeAction(formData: FormData) {
  const influencerId = String(formData.get("influencer_id") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const discountType = String(formData.get("discount_type") ?? "").trim();
  const discountValue = parseInt(String(formData.get("discount_value") ?? "0"), 10);
  const maxRedemptionsStr = String(formData.get("max_redemptions") ?? "").trim();

  if (!influencerId || !code || !discountType || !discountValue) {
    return { error: "Influencer, code, discount type, and discount value are required." };
  }
  const checked = validateInfluencerPromo({
    discountType,
    discountValue,
    maxRedemptions: maxRedemptionsStr,
  });
  if (!checked.ok) return { error: checked.error };
  const artistSlug = await influencerArtist(influencerId);
  if (!artistSlug) return { error: "Influencer not found." };
  if (!(await canManageArtist(artistSlug))) return FORBIDDEN;

  const supa = createAdminClient();
  const { data, error } = await supa
    .from("influencer_promo_codes")
    .insert({
      influencer_id: influencerId,
      code,
      discount_type: checked.value.discountType,
      discount_value: checked.value.discountValue,
      max_redemptions: checked.value.maxRedemptions,
      current_redemptions: 0,
    })
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/influencers");
  return { success: true as const, code: data.code };
}

/**
 * Update an influencer's status or details.
 */
export async function updateInfluencerAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim();
  const status = String(formData.get("status") ?? "active").trim();

  if (!id) return { error: "Influencer ID is required." };
  const artistSlug = await influencerArtist(id);
  if (!artistSlug) return { error: "Influencer not found." };
  if (!(await canManageArtist(artistSlug))) return FORBIDDEN;

  const supa = createAdminClient();
  const { error } = await supa
    .from("influencers")
    .update({ handle: handle || undefined, status })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/admin/influencers");
  return { success: true as const };
}
