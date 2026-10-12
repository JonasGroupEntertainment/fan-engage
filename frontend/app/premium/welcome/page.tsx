import Link from "next/link";
import ShareButton from "@/components/share-button";
import { redirect } from "next/navigation";
import { getStripe } from "@/lib/stripe";
import { getCurrentCommunity } from "@/lib/community";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Post-checkout landing. Stripe redirects the browser here with
 * `?session_id=cs_...`. We fetch the Session server-side to confirm
 * payment before displaying the welcome UI — the webhook has likely
 * already fired and flipped the membership to 'premium', but the
 * webhook is async so we don't guarantee DB state is updated yet.
 * This page shows the payment confirmation; the membership will be
 * live by the next page render.
 */
export default async function PremiumWelcomePage({
  searchParams,
}: {
  searchParams?: Promise<{ session_id?: string }>;
}) {
  const params = (await searchParams) ?? {};
  if (!params.session_id) redirect("/premium");

  const community = await getCurrentCommunity();

  let status: "complete" | "pending" | "unknown" = "unknown";
  let customerEmail: string | null = null;
  let billingPeriod: string | null = null;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(
      params.session_id,
      { expand: ["subscription", "line_items.data.price"] },
    );

    if (session.payment_status === "paid" || session.status === "complete") {
      status = "complete";
    } else {
      status = "pending";
    }

    customerEmail = session.customer_details?.email ?? null;
    const meta = session.metadata ?? {};
    billingPeriod = (meta.billing_period as string | undefined) ?? null;
  } catch (err) {
    console.warn("PremiumWelcomePage: failed to fetch session", err);
  }

  // Founding Fan is claimed on join/onboarding, not by this checkout.
  // Read the free number once. Do not wait on the webhook.
  let founderNumber: number | null = null;
  let fanFirstName: string | null = null;
  let fanHandle: string | null = null;
  if (status === "complete" && community) {
    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const admin = createAdminClient();
        const { data } = await admin
          .from("fan_community_memberships")
          .select("founding_fan_number")
          .eq("fan_id", user.id)
          .eq("community_id", community.slug)
          .maybeSingle();
        const n = (data?.founding_fan_number as number | null) ?? null;
        if (typeof n === "number" && n >= 1) founderNumber = n;
        const { data: fan } = await admin
          .from("fans")
          .select("first_name, profile_slug")
          .eq("id", user.id)
          .maybeSingle();
        fanFirstName = (fan?.first_name as string | null) ?? null;
        fanHandle = (fan?.profile_slug as string | null) ?? null;
      }
    } catch (err) {
      console.warn("PremiumWelcomePage: founding fan lookup failed", err);
    }
  }

  const accentFrom = community?.accent_from ?? "#7c3aed";
  const accentTo = community?.accent_to ?? "#fb923c";

  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[500px] opacity-40"
        style={{
          backgroundImage: `radial-gradient(ellipse at 50% 0%, ${accentFrom}55, transparent 60%)`,
        }}
      />

      <div className="relative mx-auto max-w-2xl px-6 py-24 text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full text-3xl"
             style={{ backgroundImage: `linear-gradient(135deg, ${accentFrom}, ${accentTo})` }}>
          {status === "complete" ? "✓" : "⏳"}
        </div>

        {status === "complete" ? (
          founderNumber !== null ? (
            <>
                  <p
                    className="text-xs font-semibold uppercase tracking-[0.4em]"
                    style={{
                      color: accentFrom,
                    }}
                  >
                    {fanFirstName
                      ? `${fanFirstName}, you made it.`
                      : "You made it."}
                  </p>
                  <h1
                    className="mt-3 text-4xl font-semibold md:text-5xl"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    You&apos;re{" "}
                    <span
                      className="bg-clip-text text-transparent"
                      style={{
                        backgroundImage: `linear-gradient(90deg, ${accentFrom}, ${accentTo})`,
                      }}
                    >
                      Founding Fan #{founderNumber}
                    </span>
                    .
                  </h1>
                  <p
                    className="mt-5 text-9xl font-bold tabular-nums md:text-[10rem]"
                    style={{
                      fontFamily: "var(--font-display)",
                      backgroundImage: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    #{founderNumber}
                  </p>
                  <p className="mt-6 text-white/75">
                    Founding Fan is a free badge with 1.5× points while your account stays active. Premium is billed at the rate shown at checkout.
                  </p>
                  <div
                    className="mx-auto mt-6 inline-flex items-center gap-3 rounded-full border px-5 py-2 text-xs font-semibold uppercase tracking-widest"
                    style={{
                      borderColor: `${accentFrom}55`,
                      color: accentFrom,
                      backgroundColor: "rgba(255,255,255,0.03)",
                    }}
                  >
                    🌟 Founding Fan badge · 1.5× points
                  </div>
                  {customerEmail && (
                    <p className="mt-6 text-xs text-white/50">
                      Receipt on its way to{" "}
                      <span className="text-white/80">{customerEmail}</span>.
                    </p>
                  )}
            </>
          ) : (
            <>
              <h1
                className="text-4xl font-semibold md:text-5xl"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Welcome to{" "}
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${accentFrom}, ${accentTo})`,
                  }}
                >
                  {community?.display_name ?? "the community"} Premium
                </span>
                .
              </h1>
              <p className="mt-4 text-white/70">
                {billingPeriod === "annual"
                  ? "Your annual membership is active."
                  : "Your monthly membership is active."}{" "}
                {customerEmail && (
                  <>
                    A receipt is on its way to{" "}
                    <span className="text-white">{customerEmail}</span>.
                  </>
                )}
              </p>
              <p className="mt-4 text-white/75">
                Founding Fan is a free badge with 1.5× points while your account stays active. Premium is billed at the rate shown at checkout.
              </p>
            </>
          )
        ) : (
          <>
            <h1
              className="text-4xl font-semibold md:text-5xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Processing…
            </h1>
            <p className="mt-4 text-white/70">
              Stripe is confirming your payment. Refresh in a moment or head
              back to the community — your Premium perks will be live
              within seconds.
            </p>
          </>
        )}

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-full px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
            style={{
              backgroundImage: `linear-gradient(90deg, ${accentFrom}, ${accentTo})`,
            }}
          >
            Go to community →
          </Link>
          {founderNumber !== null && community?.slug && (
            <ShareButton
              title={`I'm Founding Fan #${founderNumber} for ${community.display_name ?? community.slug}`}
              text={`I'm Founding Fan #${founderNumber} for ${community.display_name ?? community.slug} on Fan Engage! ${process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app"}/share/founder/${community.slug}/${founderNumber}`}
              url={`${process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app"}/share/founder/${community.slug}/${founderNumber}`}
              label="Share my badge"
              variant="ghost"
            />
          )}
          {fanHandle && (
            <Link
              href={`/fans/${fanHandle}`}
              className="rounded-full border border-white/25 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
            >
              View your profile →
            </Link>
          )}
          <Link
            href="/inbox"
            className="rounded-full border border-white/25 px-5 py-3 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            Open inbox
          </Link>
        </div>

        {founderNumber !== null && (
          <p className="mt-12 text-xs uppercase tracking-widest text-white/45">
            Free badge · 1.5× points while your account stays active
          </p>
        )}
      </div>
    </main>
  );
}
