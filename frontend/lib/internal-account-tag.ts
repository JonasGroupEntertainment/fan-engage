import { isInternalAccountEmail } from "@/lib/internal-accounts";
import { captureAppException } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sets fans.is_internal for a signed-in account whose email is staff
 * or on an internal domain. No-op for everyone else. Never logs the
 * address. Failures are swallowed so signup and login still finish.
 */
export async function tagFanInternalIfNeeded(
  user: {
    id: string;
    email?: string | null;
  },
  route: "/signup" | "/auth/callback" = "/signup",
): Promise<void> {
  if (!user.email || !isInternalAccountEmail(user.email)) return;
  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("fans")
      .update({ is_internal: true })
      .eq("id", user.id);
    if (error) {
      console.warn("signup: internal account tag was not saved");
      await captureAppException(error, {
        route,
        step: "tag-internal-account",
        fan_id: user.id,
        code: error.code,
      });
    }
  } catch (error) {
    console.warn("signup: internal account tag was not saved");
    await captureAppException(error, {
      route,
      step: "tag-internal-account",
      fan_id: user.id,
    });
  }
}
