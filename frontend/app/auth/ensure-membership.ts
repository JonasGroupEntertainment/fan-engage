"use server";

import { createClient } from "@/lib/supabase/server";
import { ensureImportedFanRaelynnMembership } from "@/lib/ensure-raelynn-membership";

/**
 * After a browser sign-in (password, recovery, or PKCE complete), give an
 * imported fan their RaeLynn membership if the row is still missing.
 * Failures stay on the server so login still finishes.
 */
export async function ensureImportedFanMembership(): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await ensureImportedFanRaelynnMembership(user.id);
  } catch {
    console.warn("membership: raelynn join was not saved");
  }
}
