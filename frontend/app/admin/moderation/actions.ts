"use server";

import { revalidatePath } from "next/cache";
import { authorizeAdmin } from "@/lib/admin-guard";
import { communityOfRow } from "@/lib/community-owner";
import { applyAdminOverride } from "@/lib/moderation";
import {
  OVERRIDE_ACTION_STATUS,
  decideOverride,
  parseOverrideForm,
  type ModerationOverrideStatus,
} from "@/lib/moderation/apply";

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
 *
 * Form parsing and the scope decision live in lib/moderation/apply so the
 * artist-portal queue (app/artist-portal/moderation/actions.ts) cannot
 * drift from this file. Authorization stays here: admins are checked by
 * lib/admin-guard, portal teams by lib/artist-portal/access.
 */

async function override(
  formData: FormData,
  newStatus: ModerationOverrideStatus,
): Promise<void> {
  const parsed = parseOverrideForm(formData);
  if (!parsed) return;
  const { table, rowId, notes } = parsed;

  // Check the caller against the community that owns the row, not the form.
  const communityId = await communityOfRow(table, rowId);
  if (!communityId) return;
  const guard = await authorizeAdmin({ communityId, minRole: "editor" });
  if (!guard.ok) return;

  // authorizeAdmin already pinned the caller to this community (or they are
  // a super-admin), so the scope here is the row's own community.
  const decision = decideOverride({
    rowCommunityId: communityId,
    scopeCommunityId: communityId,
    newStatus,
  });
  if (!decision.ok) return;

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
  return override(formData, OVERRIDE_ACTION_STATUS.approve);
}

export async function hideAction(formData: FormData): Promise<void> {
  return override(formData, OVERRIDE_ACTION_STATUS.hide);
}

export async function restoreToReviewAction(
  formData: FormData,
): Promise<void> {
  return override(formData, OVERRIDE_ACTION_STATUS.requeue);
}
