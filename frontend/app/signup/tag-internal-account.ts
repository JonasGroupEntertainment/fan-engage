"use server";

import { createClient } from "@/lib/supabase/server";
import { tagFanInternalIfNeeded } from "@/lib/internal-account-tag";

/** Called after a successful password signup. Uses the session email, not form input. */
export async function tagInternalAccountOnSignup(): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await tagFanInternalIfNeeded({ id: user.id, email: user.email });
  } catch {
    console.warn("signup: internal account tag was not saved");
  }
}
