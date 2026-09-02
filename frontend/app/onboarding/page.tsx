import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { guestSignupHref } from "@/lib/guest-signup";
import { shouldRedirectGuestFromOnboarding } from "@/lib/session-presence";
import OnboardingWizard from "./onboarding-wizard";

export const metadata = { title: "Onboarding" };
export const dynamic = "force-dynamic";

/**
 * Server-confirm the session before painting the wizard. The previous
 * all-client page SSR'd "Loading…" then swapped to the form after
 * getUser(), which flaked as a hydration mismatch when the client
 * resolved a different auth state than the server HTML.
 *
 * If getUser() is briefly null but auth cookies exist, stay on
 * /onboarding — do not bounce a signed-in header to /login.
 */
export default async function OnboardingPage() {
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
    redirect(guestSignupHref({ fallbackNext: "/onboarding" }));
  }

  const email = user?.email ?? "";
  return (
    <OnboardingWizard
      initialEmail={email}
      sessionConfirmed={!bounce}
    />
  );
}
