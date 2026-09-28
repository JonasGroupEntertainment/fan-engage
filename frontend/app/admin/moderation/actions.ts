"use server";

import { revalidatePath } from "next/cache";
import { authorizeAdmin } from "@/lib/admin-guard";
import { communityOfRow } from "@/lib/community-owner";
import { applyAdminOverride, type ModerateSourceTable } from "@/lib/moderation";

/**
 * Admin override actions for the moderation queue.
 *
 * Each action calls applyAdminOverride which:
 *   1. Updates the source row's moderation_status
 *   2. Appends an audit row to moderation_decisions with decided_by='admin'
 *   3. Both happen in one transaction via the apply_moderation_decision RPC
 *
 * All three buttons (Approve / Hide / Restore) route through the same
 * underlying mechanism — the only difference is the new_status value.
 */

async function override(
  formData: FormData,
  newStatus: "safe" | "flag_review" | "auto_hide",
): Promise<void> {
  const table = String(formData.get("table") ?? "") as ModerateSourceTable;
  const rowId = String(formData.get("row_id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim() || undefined;

  if (
    !rowId ||
    (table !== "community_posts" && table !== "community_comments")
  ) {
    return;
  }

  // Check the caller against the community that owns the row, not the form.
  const communityId = await communityOfRow(table, rowId);
  if (!communityId) return;
  const guard = await authorizeAdmin({ communityId, minRole: "editor" });
  if (!guard.ok) return;

  const result = await applyAdminOverride({
    table,
    rowId,
    adminUserId: guard.ctx.user.id,
    newStatus,
    adminNotes: notes,
  });

  if (!result.ok) {
    console.error("[moderation] admin override failed:", result.error);
  }

  revalidatePath("/admin/moderation");
}

export async function approveAction(formData: FormData): Promise<void> {
  return override(formData, "safe");
}

export async function hideAction(formData: FormData): Promise<void> {
  return override(formData, "auto_hide");
}

export async function restoreToReviewAction(
  formData: FormData,
): Promise<void> {
  return override(formData, "flag_review");
}
