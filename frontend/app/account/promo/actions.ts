"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCommunityId } from "@/lib/community";
import { authorizeAdmin } from "@/lib/admin-guard";

/**
 * Promo codes grant comped premium access. A universal code ('*') works in
 * every community, so only super-admins may create or toggle one. A code
 * for one community needs owner or admin in that community.
 */
function promoCodeRequirement(communityId: string) {
  return communityId === "*"
    ? { superAdminOnly: true as const }
    : { communityId, minRole: "admin" as const };
}

export type RedeemResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function redeemPromoCode(
  _prev: RedeemResult | null,
  formData: FormData,
): Promise<RedeemResult> {
  const raw = (formData.get("code") ?? "").toString().trim().toUpperCase();
  if (!raw) return { ok: false, error: "Please enter a promo code." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in to redeem a code." };

  const admin = createAdminClient();
  const communityId = await getCurrentCommunityId();

  // 1. Look up the code (case-insensitive via UPPER stored at write-time)
  const { data: code, error: codeErr } = await admin
    .from("promo_codes")
    .select("id, description, grants_tier, community_id, max_uses, uses_count, expires_at, active")
    .eq("code", raw)
    .maybeSingle();

  if (codeErr || !code) return { ok: false, error: "That code wasn't found. Double-check and try again." };
  if (!code.active) return { ok: false, error: "This code is no longer active." };
  if (code.expires_at && new Date(code.expires_at as string) < new Date()) {
    return { ok: false, error: "This code has expired." };
  }
  if (code.max_uses !== null && (code.uses_count as number) >= (code.max_uses as number)) {
    return { ok: false, error: "This code has reached its maximum number of uses." };
  }

  // Code must apply to this community or be universal ('*')
  const codeCommId = code.community_id as string;
  const targetCommunityId = codeCommId === "*" ? communityId : codeCommId;
  if (codeCommId !== "*" && codeCommId !== communityId) {
    return { ok: false, error: "This code isn't valid for your current community." };
  }

  // 2. Check the fan hasn't already used this code
  const { data: existing } = await admin
    .from("promo_code_redemptions")
    .select("id")
    .eq("promo_code_id", code.id as string)
    .eq("fan_id", user.id)
    .maybeSingle();

  if (existing) return { ok: false, error: "You've already redeemed this code." };

  // 3. Check the fan isn't already on a paid/comped tier
  const { data: membership } = await admin
    .from("fan_community_memberships")
    .select("subscription_tier")
    .eq("fan_id", user.id)
    .eq("community_id", targetCommunityId)
    .maybeSingle();

  const currentTier = (membership?.subscription_tier as string | null) ?? "free";
  if (currentTier === "premium" || currentTier === "comped") {
    return { ok: false, error: "You already have premium access to this community." };
  }

  // 4. Grant access: upsert membership to 'comped'
  await admin
    .from("fan_community_memberships")
    .upsert(
      { fan_id: user.id, community_id: targetCommunityId, subscription_tier: "comped" },
      { onConflict: "fan_id,community_id" },
    );

  // 5. Record redemption + increment uses_count
  await admin
    .from("promo_code_redemptions")
    .insert({ promo_code_id: code.id as string, fan_id: user.id, community_id: targetCommunityId });

  await admin
    .from("promo_codes")
    .update({ uses_count: (code.uses_count as number) + 1 })
    .eq("id", code.id as string);

  revalidatePath("/premium");
  revalidatePath("/account/billing");

  const desc = (code.description as string | null) ?? "premium access";
  return { ok: true, message: `Code applied! You now have complimentary ${desc}.` };
}

// ── Admin actions ──────────────────────────────────────────────────────────

export async function createPromoCode(formData: FormData) {
  const communityId = formData.get("community_id")?.toString().trim() || "*";
  const guard = await authorizeAdmin(promoCodeRequirement(communityId));
  if (!guard.ok) throw new Error(guard.reason === "signed_out" ? "Unauthorized" : "Forbidden");

  const raw = (formData.get("code") ?? "").toString().trim().toUpperCase();
  if (!raw) throw new Error("Code is required");

  const maxUsesRaw = formData.get("max_uses")?.toString().trim();
  const expiresRaw = formData.get("expires_at")?.toString().trim();

  const admin = createAdminClient();
  await admin.from("promo_codes").insert({
    code: raw,
    description: formData.get("description")?.toString().trim() || null,
    grants_tier: formData.get("grants_tier")?.toString() || "comped",
    community_id: communityId,
    max_uses: maxUsesRaw ? parseInt(maxUsesRaw, 10) : null,
    expires_at: expiresRaw || null,
    active: true,
    created_by: guard.ctx.user.id,
  });

  revalidatePath("/admin/promo-codes");
}

export async function togglePromoCode(id: string, active: boolean) {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("promo_codes")
    .select("community_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) throw new Error("Not found");

  const guard = await authorizeAdmin(promoCodeRequirement(row.community_id as string));
  if (!guard.ok) throw new Error(guard.reason === "signed_out" ? "Unauthorized" : "Forbidden");

  await admin.from("promo_codes").update({ active }).eq("id", id);
  revalidatePath("/admin/promo-codes");
}
