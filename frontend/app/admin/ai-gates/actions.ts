"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import { AI_FEATURES, isAiFeatureKey } from "@/lib/ai-gates/core";

type Result = { success: true } | { error: string };

/** Gates span every community, so editing them is super-admin only. */
async function requireSuperAdmin(): Promise<string> {
  const guard = await authorizeAdmin({ superAdminOnly: true });
  if (!guard.ok) {
    if (guard.reason === "signed_out") redirect("/login?next=/admin/ai-gates");
    throw new Error("Forbidden");
  }
  return guard.ctx.user.id;
}

/**
 * Upsert one (feature, community) row. `enabled` = "true" | "false". Only
 * wired features may be toggled; the display-only ones return an error so a
 * stale row can never make the UI claim something the app does not honour.
 */
export async function setAiGateAction(formData: FormData): Promise<Result> {
  const userId = await requireSuperAdmin();
  const feature = String(formData.get("feature") ?? "").trim();
  const communityId = String(formData.get("community_id") ?? "").trim().toLowerCase();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  if (!isAiFeatureKey(feature)) return { error: "Unknown feature." };
  if (!communityId) return { error: "Missing community." };
  const def = AI_FEATURES.find((f) => f.key === feature);
  if (!def?.wired) return { error: `${def?.label ?? feature} is not wired yet.` };

  const { error } = await createAdminClient()
    .from("ai_feature_gates")
    .upsert(
      {
        feature,
        community_id: communityId,
        enabled,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "feature,community_id" },
    );
  if (error) {
    if (/ai_feature_gates/.test(error.message) && /relation|schema cache/i.test(error.message)) {
      return { error: "Apply migration 0091_presave_and_ai_gates.sql first — ai_feature_gates does not exist yet." };
    }
    return { error: error.message };
  }
  revalidatePath("/admin/ai-gates");
  return { success: true };
}

/** Remove the row so the env fallback applies again. */
export async function clearAiGateAction(formData: FormData): Promise<Result> {
  await requireSuperAdmin();
  const feature = String(formData.get("feature") ?? "").trim();
  const communityId = String(formData.get("community_id") ?? "").trim().toLowerCase();
  if (!isAiFeatureKey(feature) || !communityId) return { error: "Missing feature or community." };
  const { error } = await createAdminClient()
    .from("ai_feature_gates")
    .delete()
    .eq("feature", feature)
    .eq("community_id", communityId);
  if (error) return { error: error.message };
  revalidatePath("/admin/ai-gates");
  return { success: true };
}
