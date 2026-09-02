import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { guestSignupHref } from "@/lib/guest-signup";
import { shouldRedirectGuestFromOnboarding } from "@/lib/session-presence";
import MissionClient from "./mission-client";

export const metadata = { title: "First missions" };
export const dynamic = "force-dynamic";

/**
 * Same session rule as /onboarding: if getUser() is briefly null but auth
 * cookies exist, stay here. Do not bounce a signed-in header to /login.
 */
export default async function MissionPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const bounce = shouldRedirectGuestFromOnboarding({
    user,
    cookies: cookieStore.getAll(),
  });
  if (bounce) {
    redirect(guestSignupHref({ fallbackNext: "/onboarding/mission" }));
  }

  return <MissionClient sessionConfirmed={!bounce} />;
}
