"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { initializeCommunityFromApplication } from "@/lib/onboarding/init";

async function requireSuperAdmin() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/launch");
  if (!ctx.isSuperAdmin) redirect("/admin");
  return ctx;
}

/** Step 1 — create/repair the community scaffolding (idempotent). */
export async function initializeCommunityAction(formData: FormData) {
  await requireSuperAdmin();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) { console.warn('action error:', "Slug must be lowercase letters, numbers, and dashes."); return; }

  const result = await initializeCommunityFromApplication(slug);
  revalidatePath("/admin/launch");
  if (!result.ok) { console.warn('action error:', result.error ?? "Initialization failed"); return; }
  return;
}

/** Step 2 — grant the artist (or their manager) the owner role. */
export async function assignOwnerAction(formData: FormData) {
  await requireSuperAdmin();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!slug || !email.includes("@")) { console.warn('action error:', "Community and a valid email are required."); return; }

  const admin = createAdminClient();
  const { data: fan } = await admin
    .from("fans")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (!fan?.id) {
    { console.warn('action error:', "No account found for that email — they need to sign up on the fan site first.",); return; }
  }

  const { error } = await admin.from("admin_users").upsert(
    { user_id: fan.id as string, community_id: slug, role: "owner" },
    { onConflict: "user_id,community_id" },
  );
  if (error) { console.warn('action error:', error.message); return; }

  revalidatePath("/admin/launch");
  return;
}

/** Step 3 — flip the community live (or take it back down). */
export async function setCommunityActiveAction(formData: FormData) {
  await requireSuperAdmin();
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase();
  const active = String(formData.get("active") ?? "") === "true";
  if (!slug) { console.warn('action error:', "Missing community."); return; }

  const admin = createAdminClient();
  const { error } = await admin
    .from("communities")
    .update({ active })
    .eq("slug", slug);
  if (error) { console.warn('action error:', error.message); return; }

  revalidatePath("/admin/launch");
  return;
}
