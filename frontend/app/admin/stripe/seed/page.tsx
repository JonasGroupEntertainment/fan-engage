import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripeOrNull } from "@/lib/stripe";
import { seedStripeProductsAction } from "./actions";

export const dynamic = "force-dynamic";

interface CommunityRow {
  slug: string;
  display_name: string;
  type: string;
  active: boolean;
  monthly_price_cents: number;
  annual_price_cents: number;
  stripe_product_id: string | null;
  stripe_price_id_monthly: string | null;
  stripe_price_id_annual: string | null;
  stripe_price_id_founder_monthly: string | null;
  stripe_price_id_founder_annual: string | null;
}

function fmtUSD(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function StripeSeedPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/stripe/seed");
  if (!ctx.isSuperAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-white/70">
          This page is super-admin only. Your admin context is scoped to
          specific communities — contact a super-admin to seed Stripe
          products.
        </p>
      </main>
    );
  }

  const stripeReady = getStripeOrNull() !== null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("communities")
    .select(
      "slug, display_name, type, active, monthly_price_cents, annual_price_cents, stripe_product_id, stripe_price_id_monthly, stripe_price_id_annual, stripe_price_id_founder_monthly, stripe_price_id_founder_annual",
    )
    .order("sort_order");
  const communities = (data ?? []) as CommunityRow[];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/50">
          Admin · Stripe
        </p>
        <h1
          className="mt-1 text-3xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Seed Stripe products
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Creates one Stripe Product per community + four Prices per Product
          (monthly / annual × standard / founder). Runs once per community,
          idempotent — re-running on an already-seeded community is a no-op.
          Founder prices are separate from standard so raising standard
          pricing later doesn&apos;t migrate the founder cohort.
        </p>
      </div>

      {!stripeReady && (
        <div className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          <p className="font-semibold">STRIPE_SECRET_KEY not available.</p>
          <p className="mt-1 text-amber-200/80">
            Set it in Vercel env vars (Production + Preview) and redeploy.
            This page can read rows from the DB but can&apos;t call Stripe until
            the key is live in the running app.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-xs uppercase tracking-wide text-white/60">
            <tr>
              <th className="px-4 py-3 text-left">Community</th>
              <th className="px-4 py-3 text-left">Type</th>
              <th className="px-4 py-3 text-left">Pricing</th>
              <th className="px-4 py-3 text-left">Stripe</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {communities.map((c) => {
              const seeded = !!c.stripe_product_id;
              return (
                <tr key={c.slug} className="bg-black/20">
                  <td className="px-4 py-4">
                    <div className="font-semibold">{c.display_name}</div>
                    <div className="text-xs text-white/50">{c.slug}</div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide">
                      {c.type.replace("_", " ")}
                    </span>
                    {!c.active && (
                      <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/50">
                        inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-white/80">
                    {fmtUSD(c.monthly_price_cents)}/mo ·{" "}
                    {fmtUSD(c.annual_price_cents)}/yr
                  </td>
                  <td className="px-4 py-4 font-mono text-xs leading-5">
                    {seeded ? (
                      <div className="space-y-0.5 text-white/70">
                        <div className="text-white">
                          {c.stripe_product_id}
                        </div>
                        <div>
                          m: {c.stripe_price_id_monthly?.slice(0, 18) + "…"}
                        </div>
                        <div>
                          a: {c.stripe_price_id_annual?.slice(0, 18) + "…"}
                        </div>
                        <div>
                          fm:{" "}
                          {c.stripe_price_id_founder_monthly?.slice(0, 18) +
                            "…"}
                        </div>
                        <div>
                          fa:{" "}
                          {c.stripe_price_id_founder_annual?.slice(0, 18) +
                            "…"}
                        </div>
                      </div>
                    ) : (
                      <span className="text-white/50">— not seeded</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {seeded ? (
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">
                        ✓ Seeded
                      </span>
                    ) : (
                      <form action={seedStripeProductsAction}>
                        <input
                          type="hidden"
                          name="community_id"
                          value={c.slug}
                        />
                        <button
                          type="submit"
                          disabled={!stripeReady}
                          className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-xs font-semibold text-white shadow-glass transition hover:brightness-110 disabled:opacity-40"
                        >
                          Seed Stripe
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-xs text-white/50">
        Products land in Stripe test mode (the key currently starts with{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5">sk_test_</code>).
        Review in the{" "}
        <a
          href="https://dashboard.stripe.com/test/products"
          target="_blank"
          rel="noopener"
          className="underline hover:text-white"
        >
          Stripe dashboard
        </a>{" "}
        after seeding. Live mode swaps the env var at launch; you&apos;ll re-seed
        against live products at that time.
      </p>
    </main>
  );
}
