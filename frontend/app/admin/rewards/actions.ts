"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { cancelRedemption } from "@/lib/rewards/cancel";
import { getAdminContext } from "@/lib/admin";
import { redirect } from "next/navigation";

export async function createRewardAction(formData: FormData) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  const supabase = createAdminClient();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const image_url = formData.get("image_url") as string;
  const point_cost = parseInt(formData.get("point_cost") as string);
  const kind = formData.get("kind") as string;
  const stock = formData.get("stock") ? parseInt(formData.get("stock") as string) : null;
  const requires_tier = (formData.get("requires_tier") as string) || null;
  const is_drop = formData.get("is_drop") === "on";
  const drops_at_raw = (formData.get("drops_at") as string) || "";
  const expires_at_raw = (formData.get("expires_at") as string) || "";
  const drops_at = is_drop && drops_at_raw ? new Date(drops_at_raw).toISOString() : null;
  const expires_at = is_drop && expires_at_raw ? new Date(expires_at_raw).toISOString() : null;

  const { data, error } = await supabase
    .from("rewards_catalog")
    .insert([
      {
        community_id: ctx.currentCommunityId,
        title,
        description: description || null,
        image_url: image_url || null,
        point_cost,
        kind,
        stock,
        requires_tier,
        is_drop,
        drops_at,
        expires_at,
      },
    ])
    .select()
    .single();

  if (error) {
    return { error: error.message };
  }

  return { success: true, rewardId: data.id };
}

export async function updateRewardAction(formData: FormData) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  const rewardId = formData.get("id") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const image_url = formData.get("image_url") as string;
  const point_cost = parseInt(formData.get("point_cost") as string);
  const kind = formData.get("kind") as string;
  const stock = formData.get("stock") ? parseInt(formData.get("stock") as string) : null;
  const active = formData.get("active") === "on";
  const requires_tier = (formData.get("requires_tier") as string) || null;
  const is_drop = formData.get("is_drop") === "on";
  const drops_at_raw = (formData.get("drops_at") as string) || "";
  const expires_at_raw = (formData.get("expires_at") as string) || "";
  const drops_at = is_drop && drops_at_raw ? new Date(drops_at_raw).toISOString() : null;
  const expires_at = is_drop && expires_at_raw ? new Date(expires_at_raw).toISOString() : null;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("rewards_catalog")
    .update({
      title,
      description: description || null,
      image_url: image_url || null,
      point_cost,
      kind,
      stock,
      active,
      requires_tier,
      is_drop,
      drops_at,
      expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rewardId);

  if (error) {
    return { error: error.message };
  }
  // Return success instead of server-side redirect so the client form can
  // navigate via router.push() *after* the useFormSave retry succeeds.
  // Server-side redirect throws NEXT_REDIRECT which our retry wrapper would
  // misinterpret as a failure.
  return { success: true };
}

export async function toggleRewardActiveAction(rewardId: string, active: boolean) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("rewards_catalog")
    .update({ active: !active, updated_at: new Date().toISOString() })
    .eq("id", rewardId);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function markFulfilledAction(redemptionId: string, fulfillmentNote: string) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("reward_redemptions")
    .update({
      status: "fulfilled",
      fulfillment_note: fulfillmentNote || null,
      fulfilled_at: new Date().toISOString(),
    })
    .eq("id", redemptionId);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function cancelRedemptionAction(redemptionId: string) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  // Super admins can cancel in any community; everyone else only in theirs.
  const scope = ctx.isSuperAdmin ? null : ctx.currentCommunityId;
  if (!ctx.isSuperAdmin && !scope) return { error: "Unauthorized" };

  return cancelRedemption(createAdminClient(), redemptionId, scope);
}
