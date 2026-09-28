"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import {
  notifySlackApproved,
  notifySlackRejected,
  sendInviteEmail,
} from "@/lib/applications/notify";

/**
 * Phase F.1.B — Approve / reject artist applications.
 *
 * These live in a separate file from any existing `app/admin/applications/
 * actions.ts` (Phase F.1.A's read-only file) so the diff in apply.sh stays
 * tight and we don't risk clobbering anything.
 *
 * Approve flow:
 *   1. Update status='approved', reviewer, notes, approved_slug.
 *   2. Fire Slack notification (fail-soft).
 *   3. Send invite email to the contact (fail-soft).
 *   4. Revalidate admin queue.
 *
 * Reject flow:
 *   1. Update status='rejected', reviewer, notes.
 *   2. Fire Slack notification (fail-soft).
 *   3. Revalidate.
 *
 * Both actions return { ok, error?, application? } so the client form
 * can render success/failure inline. Re-running approve on an already-
 * approved row is a no-op (idempotent via the WHERE clause).
 */

interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function approveApplicationAction(
  formData: FormData,
): Promise<ActionResult> {
  // Approving or rejecting artist applications is super-admin only.
  const guard = await authorizeAdmin({ superAdminOnly: true });
  if (!guard.ok) {
    if (guard.reason === "signed_out") redirect("/login");
    return { ok: false, error: "forbidden" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const applicationId = String(formData.get("application_id") ?? "").trim();
  const slug = String(formData.get("approved_slug") ?? "").trim();
  const notes = String(formData.get("review_notes") ?? "").trim() || null;

  if (!applicationId) return { ok: false, error: "missing_application_id" };
  if (!slug) return { ok: false, error: "approved_slug_required" };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, error: "slug_must_be_kebab_case" };
  }

  const admin = createAdminClient();

  // Load the application to get contact info + display name for notifications
  const { data: appRow, error: loadErr } = await admin
    .from("applications")
    .select(
      "id, status, display_name, slug_suggestion, contact_name, contact_email, monthly_listeners",
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (loadErr || !appRow) {
    return { ok: false, error: loadErr?.message ?? "application_not_found" };
  }
  if (appRow.status !== "pending") {
    return { ok: false, error: `already_${appRow.status}` };
  }

  // Update the row. Only land the write if status is still 'pending' —
  // protects against double-clicks.
  const { error: updateErr } = await admin
    .from("applications")
    .update({
      status: "approved",
      approved_slug: slug,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("status", "pending");
  if (updateErr) return { ok: false, error: updateErr.message };

  // Fire-and-forget notifications (fail-soft pattern from Phases 1-7)
  const reviewerEmail = (user.email as string | null) ?? null;

  notifySlackApproved({
    application: {
      display_name: appRow.display_name as string,
      contact_name: (appRow.contact_name as string | null) ?? null,
      contact_email: (appRow.contact_email as string | null) ?? null,
      slug_suggestion: (appRow.slug_suggestion as string | null) ?? null,
      approved_slug: slug,
      monthly_listeners: (appRow.monthly_listeners as number | null) ?? null,
    },
    reviewerEmail,
    notes,
  }).catch(() => {});

  if (appRow.contact_email) {
    sendInviteEmail({
      to: appRow.contact_email as string,
      toName: (appRow.contact_name as string | null) ?? null,
      artistDisplayName: appRow.display_name as string,
      approvedSlug: slug,
      reviewerNotes: notes,
    }).catch(() => {});
  }

  revalidatePath("/admin/applications");
  return { ok: true };
}

export async function rejectApplicationAction(
  formData: FormData,
): Promise<ActionResult> {
  // Approving or rejecting artist applications is super-admin only.
  const guard = await authorizeAdmin({ superAdminOnly: true });
  if (!guard.ok) {
    if (guard.reason === "signed_out") redirect("/login");
    return { ok: false, error: "forbidden" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const applicationId = String(formData.get("application_id") ?? "").trim();
  const notes = String(formData.get("review_notes") ?? "").trim() || null;
  if (!applicationId) return { ok: false, error: "missing_application_id" };

  const admin = createAdminClient();

  const { data: appRow, error: loadErr } = await admin
    .from("applications")
    .select("id, status, display_name, contact_name, contact_email")
    .eq("id", applicationId)
    .maybeSingle();
  if (loadErr || !appRow) {
    return { ok: false, error: loadErr?.message ?? "application_not_found" };
  }
  if (appRow.status !== "pending") {
    return { ok: false, error: `already_${appRow.status}` };
  }

  const { error: updateErr } = await admin
    .from("applications")
    .update({
      status: "rejected",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", applicationId)
    .eq("status", "pending");
  if (updateErr) return { ok: false, error: updateErr.message };

  notifySlackRejected({
    application: {
      display_name: appRow.display_name as string,
      contact_name: (appRow.contact_name as string | null) ?? null,
      contact_email: (appRow.contact_email as string | null) ?? null,
    },
    reviewerEmail: (user.email as string | null) ?? null,
    notes,
  }).catch(() => {});

  // V1: no rejection email — admins follow up manually if they want to
  // explain. Keeps us out of false-positive auto-rejection bot territory.

  revalidatePath("/admin/applications");
  return { ok: true };
}
