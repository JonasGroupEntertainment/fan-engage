"use server";

import { tagFanInternalIfNeeded } from "@/lib/internal-account-tag";
import { captureAppException } from "@/lib/sentry";
import { createClient } from "@/lib/supabase/server";

/** Called after a successful password signup. Uses the session email, not form input. */
export async function tagInternalAccountOnSignup(): Promise<void> {
  let fanId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    fanId = user.id;
    await tagFanInternalIfNeeded({ id: user.id, email: user.email }, "/signup");
  } catch (error) {
    console.warn("signup: internal account tag was not saved");
    await captureAppException(error, {
      route: "/signup",
      step: "tag-internal-account",
      fan_id: fanId,
    });
  }
}
