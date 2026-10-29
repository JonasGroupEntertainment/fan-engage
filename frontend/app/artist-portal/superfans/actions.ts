"use server";

import { revalidatePath } from "next/cache";
import { assertPortalRole } from "@/lib/artist-portal/access";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Editors and above may mark a fan thanked (PORTAL_MIN_ROLE.superfansThank).
 * Writes a superfan_thanks row (0095) through the service role; the role
 * check above is the authorization, and the row's community is always the
 * caller's own, never a form value.
 */
export type ThankState = { error?: string; success?: true; fanId?: string } | null;

export async function markThankedAction(_prev: ThankState, formData: FormData): Promise<ThankState> {
  const ctx = await assertPortalRole("superfansThank");
  const fanId = String(formData.get("fan_id") ?? "").trim();
  if (!UUID_RE.test(fanId)) return { error: "Pick a fan first." };
  const note = String(formData.get("note") ?? "").trim().slice(0, 500);

  const admin = createAdminClient();
  // Only a member of this community can be thanked here — a fan id from
  // another artist's list (or a guessed one) is rejected before the write.
  const { data: membership, error: memberErr } = await admin
    .from("fan_community_memberships")
    .select("fan_id")
    .eq("community_id", ctx.communityId)
    .eq("fan_id", fanId)
    .maybeSingle();
  if (memberErr) return { error: memberErr.message };
  if (!membership) return { error: "That fan is not a member of this community." };

  const { error } = await admin.from("superfan_thanks").insert({
    community_id: ctx.communityId,
    fan_id: fanId,
    thanked_by: ctx.user.id,
    note: note || null,
  });
  if (error) {
    console.warn("[superfans] mark thanked failed:", error.message);
    return { error: error.message };
  }
  revalidatePath("/artist-portal/superfans");
  revalidatePath("/artist-portal/brief");
  return { success: true, fanId };
}
