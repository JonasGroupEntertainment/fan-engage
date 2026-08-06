import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeOrNull } from "@/lib/stripe";
import { openBillingPortalAction } from "./actions";

export const metadata = { title: "Billing" };
export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/billing");

  const admin = createAdminClient();
  const { data: fan } = await admin
    .from("fans")
    .select("stripe_customer_id, first_name")
    .eq("id", user.id)
    .maybeSingle();

  const hasStripe = getStripeOrNull() !== null;
  const hasCustomer = Boolean(fan?.stripe_customer_id);

  // Pull the fan's active premium memberships for context
  const { data: memberships } = await admin
    .from("fan_community_memberships")
    .select(
      "community_id, subscription_tier, billing_period, current_period_end, cancel_at_period_end",
    )
    .eq("fan_id", user.id)
    .in("subscription_tier", ["premium", "past_due", "comped"]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/60">
          Your account
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-3 text-white/70">
          Manage your subscriptions, update your card, or cancel.
        </p>
      </header>

      {!hasStripe && (
        <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-5 text-sm text-yellow-200">
          Billing is not configured in this environment. Contact your Jonas
          Group manager if you need to manage a subscription.
        </div>
      )}

      {hasStripe && !hasCustomer && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
          You don&apos;t have an active subscription yet.{" "}
          <a href="/premium" className="underline hover:text-white">
            Browse Premium plans →
          </a>
        </div>
      )}

      {hasStripe && hasCustomer && (
        <div className="space-y-6">
          {memberships && memberships.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-widest text-white/50">
                Active subscriptions
              </h2>
              {memberships.map((m) => {
                const periodEnd = m.current_period_end
                  ? new Date(m.current_period_end as string).toLocaleDateString(
                      "en-US",
                      { month: "long", day: "numeric", year: "numeric" },
                    )
                  : null;
                return (
                  <div
                    key={m.community_id as string}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3"
                  >
                    <div>
                      <p className="font-medium capitalize">
                        {(m.community_id as string).replace(/-/g, " ")}
                      </p>
                      <p className="mt-0.5 text-xs text-white/50 capitalize">
                        {m.subscription_tier as string}
                        {m.billing_period ? ` · ${m.billing_period}` : ""}
                        {periodEnd
                          ? (m.cancel_at_period_end
                              ? ` · Cancels ${periodEnd}`
                              : ` · Renews ${periodEnd}`)
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.subscription_tier === "past_due"
                          ? "bg-yellow-500/20 text-yellow-300"
                          : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {m.subscription_tier === "past_due"
                        ? "Past due"
                        : "Active"}
                    </span>
                  </div>
                );
              })}
            </section>
          )}

          <form action={openBillingPortalAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
            >
              Manage billing on Stripe →
            </button>
          </form>
          <p className="text-xs text-white/50">
            Opens Stripe&apos;s secure billing portal — update your card,
            switch plans, or cancel. You&apos;ll be returned here when done.
          </p>
        </div>
      )}
    </main>
  );
}
