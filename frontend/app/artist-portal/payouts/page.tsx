import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type PayoutRow = {
  id: string;
  month_start: string;
  amount_cents: number;
  payout_split_pct: number;
  stripe_transfer_id: string;
  status: string;
  created_at: string;
};

type CommunityPayoutInfo = {
  stripe_connect_account_id: string | null;
  stripe_connect_onboarding_complete: boolean;
  payout_split_pct: number;
};

async function getPayoutData(communityId: string): Promise<{
  community: CommunityPayoutInfo | null;
  payouts: PayoutRow[];
}> {
  const admin = createAdminClient();
  const supabase = await createClient();

  const { data: community } = await admin
    .from("communities")
    .select(
      "stripe_connect_account_id, stripe_connect_onboarding_complete, payout_split_pct"
    )
    .eq("slug", communityId)
    .maybeSingle();

  let payouts: PayoutRow[] = [];
  try {
    const { data } = await supabase
      .from("artist_payouts")
      .select(
        "id, month_start, amount_cents, payout_split_pct, stripe_transfer_id, status, created_at"
      )
      .eq("community_slug", communityId)
      .order("month_start", { ascending: false })
      .limit(24);
    payouts = (data ?? []) as PayoutRow[];
  } catch {
    // Table may not exist in this environment — safe to ignore.
    payouts = [];
  }

  return { community: community as CommunityPayoutInfo | null, payouts };
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default async function ArtistPortalPayoutsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/artist-portal/payouts");

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("community_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!adminRow) redirect("/artist-portal");

  const { community, payouts } = await getPayoutData(adminRow.community_id);

  const artistPct = community
    ? 100 - community.payout_split_pct
    : 80;
  const connected = community?.stripe_connect_onboarding_complete ?? false;

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Payouts
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Your revenue share and payout history.
        </p>
      </div>

      {/* Connect status */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          Stripe Connect
        </h2>

        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              connected ? "bg-green-400" : "bg-yellow-400"
            }`}
          />
          <span className="text-sm text-white">
            {connected ? "Connected & verified" : "Not yet connected"}
          </span>
        </div>

        {community?.stripe_connect_account_id && (
          <p className="text-xs text-white/40 font-mono">
            {community.stripe_connect_account_id}
          </p>
        )}

        {!connected && (
          <a
            href="/admin/stripe/connect"
            className="inline-flex items-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 transition-colors"
          >
            Set up payouts →
          </a>
        )}

        {/* Revenue split */}
        <div className="mt-4 rounded-xl bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-white/40 mb-3">
            Revenue split
          </p>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-white">{artistPct}%</p>
              <p className="text-xs text-white/50 mt-1">Your share</p>
            </div>
            <div className="flex-1 rounded-full bg-white/10 h-2 overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full"
                style={{ width: `${artistPct}%` }}
              />
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-white/50">
                {community?.payout_split_pct ?? 20}%
              </p>
              <p className="text-xs text-white/30 mt-1">Platform</p>
            </div>
          </div>
        </div>
      </div>

      {/* Payout history */}
      <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-white/60">
          Payout History
        </h2>
        {payouts.length === 0 ? (
          <p className="text-sm text-white/40">
            No payouts recorded yet.{" "}
            {!connected && "Connect Stripe above to start receiving payouts."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wide text-white/40">
                    Month
                  </th>
                  <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wide text-white/40">
                    Amount
                  </th>
                  <th className="pb-3 pr-4 text-xs font-medium uppercase tracking-wide text-white/40">
                    Your %
                  </th>
                  <th className="pb-3 text-xs font-medium uppercase tracking-wide text-white/40">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-white/5 last:border-0"
                  >
                    <td className="py-3 pr-4 text-white">
                      {new Date(p.month_start).toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3 pr-4 font-medium text-white">
                      {formatCents(p.amount_cents)}
                    </td>
                    <td className="py-3 pr-4 text-white/60">
                      {100 - p.payout_split_pct}%
                    </td>
                    <td className="py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.status === "completed"
                            ? "bg-green-500/20 text-green-300"
                            : "bg-yellow-500/20 text-yellow-300"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
