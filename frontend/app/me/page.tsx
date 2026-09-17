import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PREMIUM_CTA, getViewerPremiumAnywhere } from "@/lib/entitlements";
import PremiumCta from "@/components/premium-cta";

export const metadata = { title: "Account" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MeIndexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me");
  const isPremiumFan = await getViewerPremiumAnywhere();

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/60">
          Your account
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Me</h1>
        <p className="mt-3 text-white/70">
          Manage your profile, notifications, and history.
        </p>
      </header>

      <ul className="space-y-3">
        <Row
          href="/me/profile"
          title="Edit profile"
          body="Update your display name, city, and avatar."
        />
        <Row
          href="/inbox"
          title="Inbox"
          body="Recent notifications, badges, and milestones."
        />
        <Row
          href="/me/notifications"
          title="Notification preferences"
          body="Choose which drops, predictions, and milestones we ping you about."
        />
        <Row
          href="/me/privacy"
          title="Privacy"
          body="Control whether your profile is publicly viewable. Email, phone, and address are always private."
        />
        <Row
          href="/me/anniversaries"
          title="Anniversaries"
          body="Every milestone with a community you follow."
        />
        <Row
          href="/rewards"
          title="Rewards & tiers"
          body="Your tier, badges, and points history."
        />
        <Row
          href="/me/card"
          title="Fan card"
          body="Your shareable loyalty card — tier, points, and progress at a glance."
        />
        <Row
          href="/referrals"
          title="Referrals"
          body="Invite friends — earn points when they join."
        />
        {isPremiumFan ? (
          <Row
            href={PREMIUM_CTA.billingHref}
            title={PREMIUM_CTA.manageBilling}
            body="Update your card, switch plans, or cancel on Stripe."
          />
        ) : (
          <li>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div>
                <div className="font-medium">{PREMIUM_CTA.available}</div>
                <div className="mt-0.5 text-sm text-white/60">
                  {PREMIUM_CTA.unlock}
                </div>
              </div>
              <PremiumCta copy="upgrade" variant="chip" />
            </div>
          </li>
        )}
      </ul>
    </main>
  );
}

function Row({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-white/20 hover:bg-white/[0.04]"
      >
        <div>
          <div className="font-medium">{title}</div>
          <div className="mt-0.5 text-sm text-white/60">{body}</div>
        </div>
        <span aria-hidden className="text-white/30">
          →
        </span>
      </Link>
    </li>
  );
}
