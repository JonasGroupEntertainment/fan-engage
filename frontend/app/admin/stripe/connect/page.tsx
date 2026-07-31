import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { getStripeOrNull } from "@/lib/stripe";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  updatePayoutSplitAction,
  updatePricingAction,
} from "./actions";

export const dynamic = "force-dynamic";

function fmtUSD(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

/** Tiny inline sparkline — 7 bars of varying heights */
function Sparkline({ mrrCents }: { mrrCents: number }) {
  // Deterministic pseudo-random bars seeded from mrrCents so they look
  // plausible without needing historical data.
  const seed = mrrCents || 1;
  const heights = Array.from({ length: 7 }, (_, i) => {
    const v = Math.abs(Math.sin(seed * (i + 1) * 0.37)) * 0.7 + 0.3;
    return Math.round(v * 24);
  });
  const max = Math.max(...heights);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "2px",
        height: "28px",
      }}
      title="MRR trend (illustrative)"
    >
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: "6px",
            height: `${Math.round((h / max) * 24)}px`,
            borderRadius: "2px",
            background:
              i === heights.length - 1
                ? "rgba(52,211,153,0.9)"
                : "rgba(255,255,255,0.2)",
          }}
        />
      ))}
    </div>
  );
}

interface StripeRevData {
  activeCount: number;
  pastDueCount: number;
  realMrrCents: number;
}

async function fetchStripeRevenue(
  slugs: string[],
): Promise<Record<string, StripeRevData>> {
  const stripe = getStripeOrNull();
  if (!stripe) return {};

  const result: Record<string, StripeRevData> = {};

  // Fetch up to 100 active subscriptions — filter by metadata if available
  const [activeResp, pastDueResp] = await Promise.all([
    stripe.subscriptions.list({ limit: 100, status: "active", expand: [] }),
    stripe.subscriptions.list({ limit: 100, status: "past_due", expand: [] }),
  ]);

  const allSubs = [
    ...activeResp.data.map((s) => ({ ...s, _status: "active" as const })),
    ...pastDueResp.data.map((s) => ({ ...s, _status: "past_due" as const })),
  ];

  // Initialise buckets for every known slug
  for (const slug of slugs) {
    result[slug] = { activeCount: 0, pastDueCount: 0, realMrrCents: 0 };
  }

  for (const sub of allSubs) {
    const metaSlug = (sub.metadata as Record<string, string>)?.community_slug;
    const matchedSlug = metaSlug && slugs.includes(metaSlug) ? metaSlug : null;
    if (!matchedSlug) continue;

    const bucket = result[matchedSlug];
    const amountCents = sub.items.data.reduce(
      (sum, item) => sum + (item.price?.unit_amount ?? 0) * (item.quantity ?? 1),
      0,
    );

    if (sub._status === "active") {
      bucket.activeCount += 1;
      bucket.realMrrCents += amountCents;
    } else {
      bucket.pastDueCount += 1;
    }
  }

  return result;
}

export default async function StripeConnectPage() {
  const ctx = await getAdminContext();
  if (!ctx?.isSuperAdmin) redirect("/admin");

  const admin = createAdminClient();
  const { data: communities } = await admin
    .from("communities")
    .select(
      "slug, display_name, active, monthly_price_cents, annual_price_cents, " +
      "stripe_connect_account_id, stripe_connect_onboarding_complete, payout_split_pct, " +
      "stripe_product_id",
    )
    .order("display_name");

  const rows = ((communities ?? []) as unknown) as Array<{
    slug: string;
    display_name: string;
    active: boolean;
    monthly_price_cents: number;
    annual_price_cents: number;
    stripe_connect_account_id: string | null;
    stripe_connect_onboarding_complete: boolean;
    payout_split_pct: number;
    stripe_product_id: string | null;
  }>;

  const slugs = rows.map((r) => r.slug);

  // Pull live subscriber counts from Supabase (for Connect-account display)
  const { data: memberCounts } = await admin
    .from("fan_community_memberships")
    .select("community_id")
    .in("subscription_tier", ["premium", "past_due", "comped"]);

  const countByCommunity: Record<string, number> = {};
  for (const m of memberCounts ?? []) {
    countByCommunity[m.community_id] = (countByCommunity[m.community_id] ?? 0) + 1;
  }

  // Real Stripe revenue — keyed by community slug via subscription metadata
  const stripeRev = await fetchStripeRevenue(slugs);

  const stripeConfigured = Boolean(getStripeOrNull());

  // Totals across all communities
  const totalRealMrrCents = Object.values(stripeRev).reduce(
    (sum, d) => sum + d.realMrrCents,
    0,
  );
  const totalPastDue = Object.values(stripeRev).reduce(
    (sum, d) => sum + d.pastDueCount,
    0,
  );

  return (
    <div className="space-y-8 px-4 py-10 max-w-5xl mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin" className="text-xs uppercase tracking-widest text-white/50 hover:text-white">
            ← Admin
          </Link>
          <h1 className="mt-3 text-2xl font-semibold text-white">Stripe — Financial Setup</h1>
          <p className="mt-1 text-sm text-white/60">
            Set subscription pricing and track per-community revenue. All money flows into the
            platform&apos;s single Stripe account — artists are paid out manually by the
            accountant based on tracked sales, not automatically via Stripe.
          </p>
        </div>
        <Link
          href="/admin/stripe/seed"
          className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/70 hover:bg-white/10"
        >
          Stripe product seed →
        </Link>
      </header>

      {!stripeConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <strong>STRIPE_SECRET_KEY not set.</strong> Add it in Vercel → Settings → Environment Variables, then redeploy.
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            label: "Communities",
            value: rows.length,
            sub: `${rows.filter((r) => r.active).length} active`,
          },
          {
            label: "Total subscribers",
            value: Object.values(countByCommunity).reduce((a, b) => a + b, 0),
            sub: "across all communities",
          },
          {
            label: "Real MRR",
            value: totalRealMrrCents > 0 ? fmtUSD(totalRealMrrCents) : "—",
            sub: totalPastDue > 0
              ? `⚠ ${totalPastDue} past-due / churn risk`
              : "from live Stripe subs",
            warn: totalPastDue > 0,
          },
          {
            label: "Payout model",
            value: "Merchant of record",
            sub: "Accountant pays artists via bank transfer",
            warn: false,
          },
        ].map(({ label, value, sub, warn }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="mt-0.5 text-xs uppercase tracking-wide text-white/50">{label}</p>
            <p className={`mt-1 text-xs ${warn ? "text-amber-300" : "text-white/40"}`}>{sub}</p>
          </div>
        ))}
      </div>

      {/* Per-community cards */}
      <div className="space-y-6">
        {rows.map((c) => {
          const subs = countByCommunity[c.slug] ?? 0;
          const rev = stripeRev[c.slug] ?? { activeCount: 0, pastDueCount: 0, realMrrCents: 0 };

          // Prefer real Stripe MRR; fall back to estimated if Stripe returns nothing
          const displayMrr = rev.realMrrCents > 0
            ? rev.realMrrCents
            : subs * c.monthly_price_cents;
          const mrrLabel = rev.realMrrCents > 0 ? "Real MRR" : "Est. MRR";
          const artistShare = Math.round(displayMrr * (1 - c.payout_split_pct / 100));
          const hasPastDue = rev.pastDueCount > 0;

          return (
            <div
              key={c.slug}
              className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-6"
            >
              {/* Header row */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white">{c.display_name}</h2>
                  <p className="text-xs text-white/50">{c.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  {!c.active && (
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/40">Inactive</span>
                  )}
                  {hasPastDue && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                      ⚠ {rev.pastDueCount} past-due
                    </span>
                  )}
                </div>
              </div>

              {/* Revenue snapshot */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-lg font-bold text-white">{rev.activeCount > 0 ? rev.activeCount : subs}</p>
                  <p className="text-xs text-white/50">
                    {rev.activeCount > 0 ? "Active (Stripe)" : "Subscribers"}
                  </p>
                </div>
                <div className={`rounded-xl p-3 ${hasPastDue ? "bg-amber-500/10" : "bg-white/5"}`}>
                  <p className={`text-lg font-bold ${hasPastDue ? "text-amber-300" : "text-white/40"}`}>
                    {rev.pastDueCount}
                  </p>
                  <p className="text-xs text-white/50">Past-due</p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-lg font-bold text-white">{fmtUSD(displayMrr)}</p>
                  <p className="text-xs text-white/50">{mrrLabel}</p>
                </div>
                <div className="rounded-xl bg-emerald-500/10 p-3">
                  <p className="text-lg font-bold text-emerald-300">{fmtUSD(artistShare)}</p>
                  <p className="text-xs text-white/50">Artist share / mo</p>
                </div>
              </div>

              {/* Sparkline */}
              <div className="flex items-center gap-3">
                <Sparkline mrrCents={displayMrr} />
                <p className="text-xs text-white/40">MRR trend (illustrative)</p>
              </div>

              {/* Pricing edit */}
              <details className="group">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-white/60 hover:text-white list-none flex items-center gap-2">
                  <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                  Edit pricing — current: {fmtUSD(c.monthly_price_cents)}/mo · {fmtUSD(c.annual_price_cents)}/yr
                </summary>
                <form action={updatePricingAction} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="community_id" value={c.slug} />
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Monthly (cents)</label>
                    <input
                      name="monthly_price_cents"
                      type="number"
                      min={100}
                      defaultValue={c.monthly_price_cents}
                      className="w-28 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Annual (cents)</label>
                    <input
                      name="annual_price_cents"
                      type="number"
                      min={100}
                      defaultValue={c.annual_price_cents}
                      className="w-28 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20"
                  >
                    Save prices
                  </button>
                  <p className="w-full text-xs text-white/40">
                    Saves to DB only — existing subscribers keep their current Stripe price.
                    Run <Link href="/admin/stripe/seed" className="underline">Stripe seed</Link> after to push new Prices to Stripe.
                  </p>
                </form>
              </details>

              {/* Payout split edit */}
              <details className="group">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-white/60 hover:text-white list-none flex items-center gap-2">
                  <span className="group-open:rotate-90 inline-block transition-transform">▶</span>
                  Revenue split — platform keeps {c.payout_split_pct}%, artist receives {100 - c.payout_split_pct}%
                </summary>
                <form action={updatePayoutSplitAction} className="mt-4 flex flex-wrap items-end gap-3">
                  <input type="hidden" name="community_id" value={c.slug} />
                  <div>
                    <label className="block text-xs text-white/60 mb-1">Platform % (0–100)</label>
                    <input
                      name="payout_split_pct"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={c.payout_split_pct}
                      className="w-20 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-full bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20"
                  >
                    Save split
                  </button>
                </form>
              </details>

              {/* Payout reporting note */}
              <div className="border-t border-white/10 pt-5 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                  Artist payouts
                </p>
                <p className="text-xs text-white/40">
                  All revenue for this community lands in the platform&apos;s Stripe account,
                  tagged with <code className="text-white/50">community_id: {c.slug}</code>. The
                  accountant filters the Stripe dashboard/reports by that tag and pays the artist
                  their share (shown above) via bank transfer — no funds move automatically.
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
