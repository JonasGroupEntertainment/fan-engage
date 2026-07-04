"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortalContext, roleAtLeast } from "@/lib/artist-portal/access";
import type { PortalRole } from "@/lib/artist-portal/access";

const ASSIGNABLE_ROLES: PortalRole[] = ["admin", "editor", "viewer"];

/**
 * Add a team member by email. Only the community owner can manage the
 * team, and the invitee must already have a Fan Engage account (they sign
 * up like any fan; the owner then grants them a role here).
 */
export async function addTeamMemberAction(formData: FormData) {
  const ctx = await getPortalContext();
  if (!ctx || !roleAtLeast(ctx.role, "owner")) {
    { console.warn('action error:', "Only the community owner can manage the team."); return; }
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "") as PortalRole;
  if (!email || !email.includes("@")) { console.warn('action error:', "Enter a valid email."); return; }
  if (!ASSIGNABLE_ROLES.includes(role)) { console.warn('action error:', "Invalid role."); return; }

  const admin = createAdminClient();

  // Resolve the account by email — fans.id is the auth user id (the fan
  // row is created by the auth trigger at signup).
  const { data: fan } = await admin
    .from("fans")
    .select("id, email")
    .ilike("email", email)
    .maybeSingle();

  const userId = fan?.id as string | undefined;
  if (!userId) {
    { console.warn('action error:', "No account found for that email. Ask them to sign up at the fan site first, then add them here.",); return; }
  }

  const { error } = await admin.from("admin_users").upsert(
    { user_id: userId, community_id: ctx.communityId, role },
    { onConflict: "user_id,community_id" },
  );
  if (error) { console.warn('action error:', error.message); return; }

  revalidatePath("/artist-portal/team");
  return;
}

export async function removeTeamMemberAction(formData: FormData) {
  const ctx = await getPortalContext();
  if (!ctx || !roleAtLeast(ctx.role, "owner")) {
    { console.warn('action error:', "Only the community owner can manage the team."); return; }
  }

  const userId = String(formData.get("user_id") ?? "");
  if (!userId) { console.warn('action error:', "Missing user."); return; }
  if (userId === ctx.user.id) {
    { console.warn('action error:', "You can't remove yourself."); return; }
  }

  const admin = createAdminClient();

  // Never remove another owner from here — that's a super-admin operation.
  const { data: target } = await admin
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .eq("community_id", ctx.communityId)
    .maybeSingle();
  if (target?.role === "owner") {
    { console.warn('action error:', "Owners can only be changed by Jonas Group staff."); return; }
  }

  const { error } = await admin
    .from("admin_users")
    .delete()
    .eq("user_id", userId)
    .eq("community_id", ctx.communityId);
  if (error) { console.warn('action error:', error.message); return; }

  revalidatePath("/artist-portal/team");
  return;
}
