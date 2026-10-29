import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guestSignupHref } from "@/lib/guest-signup";
import { shouldRedirectGuestFromOnboarding } from "@/lib/session-presence";
import { isUnpublishedArtistSlug } from "@/lib/artists";
import { parseArtistParam, withArtistParam } from "@/lib/onboarding/artist-param";
import OnboardingWizard, { type LockedArtist } from "./onboarding-wizard";

export const metadata = { title: "Onboarding" };
export const dynamic = "force-dynamic";

/**
 * `?artist=<slug>` → the active artist the wizard locks the fan into.
 * Validated here, never trusted from the URL: the slug must be an active row
 * in public.artists (so `nellies`, fan invite codes, and typos all resolve
 * to null and the wizard keeps its ?ref= / RaeLynn default behaviour).
 */
async function resolveLockedArtist(
  raw: string | string[] | undefined,
): Promise<LockedArtist | null> {
  const slug = parseArtistParam(raw);
  if (!slug || isUnpublishedArtistSlug(slug)) return null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("artists")
      .select("slug, name")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle();
    if (!data) return null;
    const row = data as { slug: string; name: string };
    return { slug: row.slug, name: row.name };
  } catch {
    return null;
  }
}

/**
 * Server-confirm the session before painting the wizard. The previous
 * all-client page SSR'd "Loading…" then swapped to the form after
 * getUser(), which flaked as a hydration mismatch when the client
 * resolved a different auth state than the server HTML.
 *
 * If getUser() is briefly null but auth cookies exist, stay on
 * /onboarding — do not bounce a signed-in header to /login.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ artist?: string | string[] }>;
}) {
  const supabase = await createClient();
  const [cookieStore, sp] = await Promise.all([cookies(), searchParams]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const bounce = shouldRedirectGuestFromOnboarding({
    user,
    cookies: cookieStore.getAll(),
  });
  if (bounce) {
    // Keep the artist pick on the round trip through signup.
    redirect(
      guestSignupHref({
        ref: parseArtistParam(sp.artist),
        fallbackNext: withArtistParam("/onboarding", parseArtistParam(sp.artist)),
      }),
    );
  }

  const lockedArtist = await resolveLockedArtist(sp.artist);

  const email = user?.email ?? "";
  let initialPhone = "";
  let initialSmsConsent = false;
  if (user) {
    const { data: fan } = await supabase
      .from("fans")
      .select("phone, sms_opted_in")
      .eq("id", user.id)
      .maybeSingle();
    initialPhone = typeof fan?.phone === "string" ? fan.phone : "";
    initialSmsConsent = fan?.sms_opted_in === true;
  }
  return (
    <OnboardingWizard
      initialEmail={email}
      initialPhone={initialPhone}
      initialSmsConsent={initialSmsConsent}
      sessionConfirmed={!bounce}
      lockedArtist={lockedArtist}
    />
  );
}
