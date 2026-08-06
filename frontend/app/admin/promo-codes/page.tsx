import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPromoCode, togglePromoCode } from "@/app/account/promo/actions";
import CreateStripeCouponForm from "./create-stripe-coupon-form";

export const dynamic = "force-dynamic";

export default async function PromoCodesPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/promo-codes");

  const admin = createAdminClient();

  // Fetch all in-site promo codes
  const { data: codes } = await admin
    .from("promo_codes")
    .select("id, code, description, grants_tier, community_id, max_uses, uses_count, expires_at, active, created_at")
    .order("created_at", { ascending: false });

  // Fetch redemption counts per code for display
  const { data: redemptions } = await admin
    .from("promo_code_redemptions")
    .select("promo_code_id, fan_id");

  const redemptionsByCode = new Map<string, number>();
  for (const r of redemptions ?? []) {
    const id = r.promo_code_id as string;
    redemptionsByCode.set(id, (redemptionsByCode.get(id) ?? 0) + 1);
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold">Promo Codes</h1>

      {/* ── In-site comped codes ─────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">In-site codes (free access)</h2>
            <p className="mt-0.5 text-sm text-white/55">
              Fans enter these on the /premium page to get comped access instantly — no payment required.
            </p>
          </div>
        </div>

        {/* Create form */}
        <form
          action={createPromoCode}
          className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4"
        >
          <p className="text-sm font-medium text-white/80">Create new code</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-white/50">Code *</label>
              <input
                name="code"
                required
                placeholder="e.g. PRESS2026"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm uppercase tracking-wider text-white placeholder:normal-case placeholder:text-white/30 focus:border-aurora/50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/50">Description (internal)</label>
              <input
                name="description"
                placeholder="e.g. Press passes — June 2026"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-aurora/50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/50">Community (leave blank = all)</label>
              <input
                name="community_id"
                placeholder="raelynn  (blank = *)"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-aurora/50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/50">Max uses (blank = unlimited)</label>
              <input
                name="max_uses"
                type="number"
                min="1"
                placeholder="50"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-aurora/50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/50">Expires at (blank = never)</label>
              <input
                name="expires_at"
                type="datetime-local"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-aurora/50 focus:outline-none"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-white/50">Grants tier</label>
              <select
                name="grants_tier"
                className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white focus:border-aurora/50 focus:outline-none"
              >
                <option value="comped">Comped (free premium)</option>
                <option value="premium">Premium</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-aurora/20 px-5 py-2 text-sm font-medium text-aurora hover:bg-aurora/30 transition"
          >
            Create code →
          </button>
        </form>

        {/* Code list */}
        {(codes ?? []).length === 0 ? (
          <p className="text-sm text-white/50">No codes yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/50">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Community</th>
                  <th className="px-4 py-3">Uses</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(codes ?? []).map((c) => {
                  const used = redemptionsByCode.get(c.id as string) ?? 0;
                  const maxStr = c.max_uses != null ? `/ ${c.max_uses}` : "/ ∞";
                  const expired = c.expires_at && new Date(c.expires_at as string) < new Date();
                  return (
                    <tr key={c.id as string} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3 font-mono font-semibold tracking-wider">{c.code as string}</td>
                      <td className="px-4 py-3 text-white/60">{(c.description as string | null) ?? "—"}</td>
                      <td className="px-4 py-3 text-white/60">{c.community_id === "*" ? "All" : c.community_id as string}</td>
                      <td className="px-4 py-3 tabular-nums">{used} {maxStr}</td>
                      <td className="px-4 py-3 text-white/60 text-xs">
                        {c.expires_at
                          ? <span className={expired ? "text-red-400" : ""}>{new Date(c.expires_at as string).toLocaleDateString()}{expired ? " (expired)" : ""}</span>
                          : "Never"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.active ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/50"}`}>
                          {c.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <form action={togglePromoCode.bind(null, c.id as string, !c.active)}>
                          <button type="submit" className="text-xs text-white/50 hover:text-white transition">
                            {c.active ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Stripe discount coupons ──────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Stripe discount coupons</h2>
          <p className="mt-0.5 text-sm text-white/55">
            These apply a percentage or fixed discount at Stripe checkout. Fans enter them in the Stripe-hosted payment page.
          </p>
        </div>
        <CreateStripeCouponForm />
      </section>
    </div>
  );
}
