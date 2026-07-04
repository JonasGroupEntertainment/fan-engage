"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { redirect } from "next/navigation";
import { awardPoints } from "@/lib/points/award";

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

export async function cancelRedemptionAction(
  redemptionId: string,
  fanId: string,
  pointCost: number
) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  const supabase = createAdminClient();

  // Grab the redemption's community so the refund lands on the same
  // membership the original spend came out of.
  const { data: redemption } = await supabase
    .from("reward_redemptions")
    .select("community_id")
    .eq("id", redemptionId)
    .maybeSingle();

  // Update redemption status
  const { error: updateError } = await supabase
    .from("reward_redemptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
    })
    .eq("id", redemptionId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Refund points via shared utility (updates fans + fan_community_memberships).
  const pointsError = await awardPoints(supabase, {
    fanId,
    delta: pointCost,
    source: "reward_redemption",
    sourceRef: `redemption:${redemptionId}:refund`,
    note: `Refunded: redemption cancelled`,
    ...(redemption?.community_id
      ? { communityId: redemption.community_id as string }
      : {}),
  }).then(() => null).catch((e: Error) => e);

  if (pointsError) {
    return { error: pointsError.message };
  }

  return { success: true };
}
