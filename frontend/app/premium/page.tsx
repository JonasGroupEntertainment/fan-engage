import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentCommunityId } from "@/lib/community";
import { fmtPrice } from "@/lib/stripe-helpers";
import { getFoundingFanClaimState } from "@/lib/data/founding-fans";
import { createCheckoutSessionAction } from "./actions";
import { FounderSlotsCounter } from "./founder-slots-counter";
import PromoCodeForm from "@/app/account/promo/promo-code-form";

export const dynamic = "force-dynamic";

interface CommunityWithPricing {
  slug: string;
  display_name: string;
  tagline: string | null;
  accent_from: string;
  accent_to: string;
  monthly_price_cents: number;
  annual_price_cents: number;
  stripe_product_id: string | null;
  founder_cap: number;
  active: boolean;
}

export default async function PremiumPage({
  searchParams,
}: {
  searchParams?: Promise<{
    canceled?: string;
    already_active?: string;
  }>;
}) {
  const params = (await searchParams) ?? {};

  // Who's the viewer + what's the community?
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const communityId = await getCurrentCommunityId();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("communities")
    .select(
      "slug, display_name, tagline, accent_from, accent_to, monthly_price_cents, annual_price_cents, stripe_product_id, founder_cap, active",
    )
    .eq("slug", communityId)
    .maybeSingle();
  const community = row as CommunityWithPricing | null;
  if (!community) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-white/70">
        <h1 className="text-2xl font-semibold text-white">Not found</h1>
        <p className="mt-2">This community isn&apos;t available yet.</p>
      </main>
    );
  }

  // Membership state — needed to show the right CTA (Upgrade / Manage / etc.)
  let tier: string | null = null;
  if (user) {
    const { data: membership } = await admin
      .from("fan_community_memberships")
      .select("subscription_tier")
      .eq("fan_id", user.id)
      .eq("community_id", communityId)
      .maybeSingle();
    tier = (membership?.subscription_tier as string | null) ?? null;
  }
  const isPremium =
    tier === "premium" || tier === "past_due" || tier === "comped";

  const founder = await getFoundingFanClaimState(communityId);

  const monthly = community.monthly_price_cents;
  const annual = community.annual_price_cents;
  const annualMonthlyEquiv = Math.round(annual / 12);
  const annualSavingsPct = Math.round(
    (1 - annual / (monthly * 12)) * 100,
  );
  const premiumNextPath = "/premium";
  const premiumSignupHref = `/signup?ref=${encodeURIComponent(communityId)}&next=${encodeURIComponent(premiumNextPath)}`;
  const premiumLoginHref = `/login?next=${encodeURIComponent(premiumNextPath)}`;

  const perks = [
    { icon: "🎙️", title: "Backstage feed", body: "Posts only Premium fans see — raw tour moments and works-in-progress." },
    { icon: "🎁", title: "Exclusive digital drops", body: "Premium-only digital unlocks inside the app." },
    { icon: "🎬", title: "Behind-the-song clips", body: "In-app clips when a track is ready — digital only." },
    { icon: "📱", title: "Phone & lyric wallpapers", body: "Exclusive wallpapers you redeem with points inside the app." },
    { icon: "💬", title: "Monthly AMA", body: "Live Q&A with the artist — ask anything." },
    { icon: "🏆", title: "Premium badges", body: "The full status ladder — Silver, Gold, Platinum, and event badges." },
    { icon: "⚡", title: "1.5× points", body: "Every fan action earns 1.5× more toward rewards." },
    { icon: "🏅", title: "Founding Fan status", body: "First 100 fans lock a numbered Founding Fan badge on their profile." },
  ];

  return (
    <main className="relative overflow-hidden">
      {/* Accent halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[500px] opacity-40"
        style={{
          backgroundImage: `radial-gradient(ellipse at 50% 0%, ${community.accent_from}55, transparent 60%)`,
        }}
      />

      <div className="relative mx-auto max-w-5xl px-6 py-16">
        {/* Alerts */}
        {params.canceled && (
          <div className="mb-8 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-white/75">
            Checkout canceled. You can pick up where you left off whenever
            you&apos;re ready.
          </div>
        )}
        {params.already_active && (
          <div className="mb-8 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            You&apos;re already a Premium fan of {community.display_name} —
            welcome back.
          </div>
        )}

        {/* Header */}
        <p className="text-xs uppercase tracking-widest text-white/50">
          Premium Fan Experience
        </p>
        <h1
          className="mt-3 text-4xl font-semibold md:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {community.display_name}{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: `linear-gradient(90deg, ${community.accent_from}, ${community.accent_to})`,
            }}
          >
            Premium
          </span>
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-white/70">
          {community.tagline ?? `The inner circle of the ${community.display_name} community.`}{" "}
          {fmtPrice(monthly)}/month or {fmtPrice(annual)}/year — everything
          below, no ads, no gimmicks.
        </p>

        {/* Founder banner */}
        {!founder.closed && (
          <div
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-gradient-to-r from-aurora/20 to-ember/20 px-4 py-2 text-xs font-medium text-white"
            style={{
              borderColor: `${community.accent_from}66`,
            }}
          >
            <span aria-hidden>🌟</span>
            Founding Fan pricing — {founder.remaining.toLocaleString("en-US")} {founder.remaining === 1 ? "spot" : "spots"} remaining of {founder.cap.toLocaleString("en-US")}.
          </div>
        )}
        {founder.closed && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/55">
            Founding Fan spots are full. Standard pricing applies — future
            price increases won&apos;t affect existing subscribers on either
            plan.
          </div>
        )}

        {/* Founder wall link */}
        {founder.cap > 0 && (
          <div className="mt-3">
            <Link
              href={`/artists/${communityId}/founders`}
              className="text-xs text-white/60 hover:text-white/80 transition"
            >
              See who&apos;s already a Founding Fan →
            </Link>
          </div>
        )}

        {/* Real-time slot counter */}
        {!founder.closed && founder.cap > 0 && (
          <FounderSlotsCounter
            initialFilled={founder.claimed}
            total={founder.cap}
          />
        )}

        {/* Already-Premium state */}
        {isPremium && (
          <section className="mt-10 rounded-3xl border border-emerald-500/40 bg-emerald-500/10 p-6">
            <p className="text-xs uppercase tracking-widest text-emerald-300">
              You&apos;re in
            </p>
            <h2 className="mt-1 text-2xl font-semibold">
              Premium is active{tier === "comped" && " (comped access)"}
              {tier === "past_due" && " — card needs attention"}
            </h2>
            <p className="mt-2 text-sm text-white/70">
              {tier === "past_due"
                ? "Your most recent payment failed and Stripe is retrying. Update your card to keep access when the grace period ends."
                : tier === "comped"
                  ? "Your Premium access was granted directly by the Jonas Group team. You get every perk below at no charge."
                  : "All perks below are unlocked. Thanks for being one of us."}
            </p>
            <div className="mt-4 flex gap-3">
              <Link
                href="/"
                className="rounded-full bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
              >
                Back to community
              </Link>
              {tier !== "comped" && (
                <Link
                  href="/account/billing"
                  className="rounded-full border border-white/20 px-4 py-2 text-sm text-white/80 hover:bg-white/5"
                >
                  Manage billing →
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Signed-out: auth-first CTAs. Stripe plan buttons only after sign-in. */}
        {!isPremium && !user && (
          <section className="mt-10 space-y-6">
            <div
              className="rounded-3xl border border-white/15 bg-gradient-to-r from-white/10 via-black/40 to-white/5 p-6"
              style={{ borderColor: `${community.accent_from}66` }}
            >
              <p className="text-xs uppercase tracking-widest text-white/50">
                Start here
              </p>
              <h2
                className="mt-2 text-2xl font-semibold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Create a free fan account first
              </h2>
              <p className="mt-2 max-w-xl text-sm text-white/70">
                Make your profile, then come back to choose monthly or annual
                Premium. It takes about a minute.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href={premiumSignupHref}
                  className="inline-flex rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${community.accent_from}, ${community.accent_to})`,
                  }}
                >
                  Create account
                </Link>
                <Link
                  href={premiumLoginHref}
                  className="inline-flex rounded-full border border-white/20 px-5 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
                >
                  Sign in
                </Link>
              </div>
            </div>

            {/* Pricing preview only — no Stripe checkout until signed in */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col items-start rounded-3xl border border-white/10 bg-black/40 p-6">
                <p className="text-xs uppercase tracking-widest text-white/50">
                  Monthly
                </p>
                <p
                  className="mt-3 text-4xl font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {fmtPrice(monthly)}
                  <span className="ml-1 text-base font-normal text-white/50">
                    /mo
                  </span>
                </p>
                <p className="mt-2 text-xs text-white/55">
                  Cancel anytime. No long-term commitment.
                </p>
                <p className="mt-6 text-xs text-white/45">
                  Available after you create an account.
                </p>
              </div>
              <div className="relative flex flex-col items-start rounded-3xl border-2 border-white/20 bg-gradient-to-br from-white/8 to-black/40 p-6">
                <span className="absolute right-4 top-4 rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                  Save {annualSavingsPct}%
                </span>
                <p className="text-xs uppercase tracking-widest text-white/50">
                  Annual
                </p>
                <p
                  className="mt-3 text-4xl font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {fmtPrice(annual)}
                  <span className="ml-1 text-base font-normal text-white/50">
                    /yr
                  </span>
                </p>
                <p className="mt-2 text-xs text-white/55">
                  Works out to {fmtPrice(annualMonthlyEquiv)}/mo. Two months free.
                </p>
                <p className="mt-6 text-xs text-white/45">
                  Available after you create an account.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Plan picker — signed-in, not already premium */}
        {!isPremium && user && (
          <section className="mt-10 grid gap-4 md:grid-cols-2">
            {/* Monthly */}
            <form action={createCheckoutSessionAction} className="contents">
              <input type="hidden" name="billing_period" value="monthly" />
              <button
                type="submit"
                disabled={!community.stripe_product_id}
                className="group flex flex-col items-start rounded-3xl border border-white/10 bg-black/40 p-6 text-left transition hover:border-white/25 hover:bg-white/5 disabled:opacity-50"
              >
                <p className="text-xs uppercase tracking-widest text-white/50">
                  Monthly
                </p>
                <p
                  className="mt-3 text-4xl font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {fmtPrice(monthly)}
                  <span className="ml-1 text-base font-normal text-white/50">
                    /mo
                  </span>
                </p>
                <p className="mt-2 text-xs text-white/55">
                  Cancel anytime. No long-term commitment.
                </p>
                <span
                  className="mt-6 inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white transition group-hover:brightness-110"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${community.accent_from}, ${community.accent_to})`,
                  }}
                >
                  Choose monthly →
                </span>
              </button>
            </form>

            {/* Annual */}
            <form action={createCheckoutSessionAction} className="contents">
              <input type="hidden" name="billing_period" value="annual" />
              <button
                type="submit"
                disabled={!community.stripe_product_id}
                className="group relative flex flex-col items-start rounded-3xl border-2 border-white/20 bg-gradient-to-br from-white/8 to-black/40 p-6 text-left transition hover:border-white/35 disabled:opacity-50"
              >
                <span className="absolute right-4 top-4 rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white">
                  Save {annualSavingsPct}%
                </span>
                <p className="text-xs uppercase tracking-widest text-white/50">
                  Annual
                </p>
                <p
                  className="mt-3 text-4xl font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {fmtPrice(annual)}
                  <span className="ml-1 text-base font-normal text-white/50">
                    /yr
                  </span>
                </p>
                <p className="mt-2 text-xs text-white/55">
                  Works out to {fmtPrice(annualMonthlyEquiv)}/mo. Two months free.
                </p>
                <span
                  className="mt-6 inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white transition group-hover:brightness-110"
                  style={{
                    backgroundImage: `linear-gradient(90deg, ${community.accent_from}, ${community.accent_to})`,
                  }}
                >
                  Choose annual →
                </span>
              </button>
            </form>
          </section>
        )}

        {/* Promo code entry — shown to signed-in non-premium fans */}
        {user && !isPremium && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-white/50">
              Have a promo code?
            </p>
            <PromoCodeForm />
          </div>
        )}

        {/* Perks */}
        <section className="mt-16">
          <p className="text-xs uppercase tracking-widest text-white/50">
            What you get
          </p>
          <h2
            className="mt-2 text-3xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Every perk, for {fmtPrice(monthly)}/month.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {perks.map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-white/10 bg-black/30 p-5"
              >
                <p className="text-2xl">{p.icon}</p>
                <p className="mt-2 font-semibold">{p.title}</p>
                <p className="mt-1 text-sm text-white/60">{p.body}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-12 text-xs text-white/50">
          Secure checkout via Stripe. Cancel anytime from your{" "}
          <a href="/account/billing" className="underline hover:text-white/70">
            billing settings
          </a>
          .
        </p>
      </div>
    </main>
  );
}
