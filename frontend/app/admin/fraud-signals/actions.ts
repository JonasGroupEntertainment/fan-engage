"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeAdmin } from "@/lib/admin-guard";

/**
 * Fraud signals are per fan across every community (the table has no
 * community column), so reviewing them is super-admin only.
 */
async function requireAdmin(): Promise<string> {
  const guard = await authorizeAdmin({ superAdminOnly: true });
  if (!guard.ok) {
    if (guard.reason === "signed_out") redirect("/login");
    throw new Error("Forbidden");
  }
  return guard.ctx.user.id;
}

async function setStatus(formData: FormData, status: "dismissed" | "confirmed") {
  const userId = await requireAdmin();
  const id = String(formData.get("signal_id") ?? "");
  if (!id) return;
  const admin = createAdminClient();
  await admin
    .from("fraud_signals")
    .update({
      status,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  revalidatePath("/admin/fraud-signals");
}

export async function dismissFraudSignalAction(formData: FormData) {
  await setStatus(formData, "dismissed");
}

export async function confirmFraudSignalAction(formData: FormData) {
  await setStatus(formData, "confirmed");
}
