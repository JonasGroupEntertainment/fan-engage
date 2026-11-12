"use server";

import { revalidatePath } from "next/cache";
import { assertPortalRole } from "@/lib/artist-portal/access";
import { communityOfRow } from "@/lib/community-owner";
import { applyAdminOverride } from "@/lib/moderation";
import {
  OVERRIDE_ACTION_STATUS,
  decideOverride,
  parseOverrideForm,
  type ModerationOverrideStatus,
} from "@/lib/moderation/apply";

/**
 * Artist-team override actions for the portal moderation queue.
 *
 * Mirrors app/admin/moderation/actions.ts, but gated by the portal role
 * matrix (PORTAL_MIN_ROLE.moderation — admin and owner) instead of the
 * JG admin guard. The portal context resolves exactly one community for
 * the caller, so every override is hard-scoped to ctx.communityId: the
 * row's owning community is read from the database and must match.
 *
 * The DB write is the same apply_moderation_decision RPC the admin queue
 * uses, so the audit trail (moderation_decisions, decided_by='admin') is
 * identical whichever surface the decision came from.
 */

async function override(
  formData: FormData,
  newStatus: ModerationOverrideStatus,
): Promise<void> {
  const ctx = await assertPortalRole("moderation");

  const parsed = parseOverrideForm(formData);
  if (!parsed) return;
  const { table, rowId, notes } = parsed;

  // The owning community comes from the row, never from the form.
  const rowCommunityId = await communityOfRow(table, rowId);
  const decision = decideOverride({
    rowCommunityId,
    scopeCommunityId: ctx.communityId,
    newStatus,
  });
  if (!decision.ok) {
    console.warn("[artist-portal/moderation] override refused:", decision.reason);
    return;
  }

  const result = await applyAdminOverride({
    table,
    rowId,
    adminUserId: ctx.user.id,
    newStatus,
    adminNotes: notes,
  });

  if (!result.ok) {
    console.error("[artist-portal/moderation] override failed:", result.error);
  }

  revalidatePath("/artist-portal/moderation");
  revalidatePath("/artist-portal", "layout");
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
