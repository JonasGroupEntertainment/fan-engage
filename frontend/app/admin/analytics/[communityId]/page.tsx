import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import Image from "next/image";

export const dynamic = "force-dynamic";

interface KpiData {
  totalMembers: number;
  premiumMembers: number;
  foundersClaimed: number;
  founderCap: number;
  mrrCents: number;
  activeFansThisWeek: number;
  totalPointsThisMonth: number;
}

interface DailyActivity {
  date: string;
  newMembers: number;
  newPosts: number;
  newRsvps: number;
  pointsEarned: number;
}

interface TopFan {
  fan_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  total_points: number;
  subscription_tier: string;
}

interface SubscriptionActivity {
  fan_id: string;
  first_name: string | null;
  last_name: string | null;
  subscription_tier: string;
  is_founder: boolean;
  founder_number: number | null;
  joined_at: string;
  current_period_end: string | null;
}

async function getAnalyticsData(
  communityId: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ kpi: KpiData; daily: DailyActivity[]; topFans: TopFan[]; subscriptions: SubscriptionActivity[]; community: any }> {
  const admin = createAdminClient();

  // Get community details
  const communityRes = await admin
    .from("communities")
    .select("*")
    .eq("slug", communityId)
    .single();

  if (communityRes.error || !communityRes.data) {
    throw new Error(`Community not found: ${communityId}`);
  }

  const community = communityRes.data;

  // Time boundaries
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // 1. Total active members
  const totalRes = await admin
    .from("fan_community_memberships")
    .select("fan_id", { count: "exact", head: true })
    .eq("community_id", communityId)
    .eq("status", "active");

  // 2. Premium/Comped members
  const premiumRes = await admin
    .from("fan_community_memberships")
    .select("fan_id", { count: "exact", head: true })
    .eq("community_id", communityId)
    .in("subscription_tier", ["premium", "comped", "past_due"]);

  // 3. Founders claimed
  const foundersRes = await admin
    .from("fan_community_memberships")
    .select("fan_id", { count: "exact", head: true })
    .eq("community_id", communityId)
    .eq("is_founder", true);

  // 4. MRR calculation
  const mrrRes = await admin
    .from("fan_community_memberships")
    .select("subscription_tier")
    .eq("community_id", communityId)
    .in("subscription_tier", ["premium", "comped", "past_due"]);

  const monthlyPrice = community.monthly_price_cents ?? 1000; // default $10
  const annualPrice = community.annual_price_cents ?? 9900; // default $99/yr

  let mrrCents = 0;
  for (const row of mrrRes.data ?? []) {
    // Simple MRR: sum of all active subscriptions at their monthly equivalent
    mrrCents += monthlyPrice;
  }

  // 5. Active fans this week (with any points_ledger entry in last 7 days)
  const activeWeekRes = await admin
    .from("points_ledger")
    .select("fan_id", { count: "exact", head: true })
    .eq("community_id", communityId)
    .gte("created_at", sevenDaysAgo.toISOString());

  // 6. Total points this month
  const pointsRes = await admin
    .from("points_ledger")
    .select("delta")
    .eq("community_id", communityId)
    .gte("created_at", thirtyDaysAgo.toISOString());

  const totalPointsThisMonth = (pointsRes.data ?? []).reduce(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (sum: number, row: any) => sum + (row.delta ?? 0),
    0
  );

  // 7. Last 7 days activity trend
  const dailyData: DailyActivity[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split("T")[0];
    const nextDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);

    const [newMembersRes, newPostsRes, newRsvpsRes, pointsRes] =
      await Promise.all([
        admin
          .from("fan_community_memberships")
          .select("fan_id", { count: "exact", head: true })
          .eq("community_id", communityId)
          .gte("joined_at", date.toISOString())
          .lt("joined_at", nextDate.toISOString()),
        admin
          .from("community_posts")
          .select("id", { count: "exact", head: true })
          .eq("community_id", communityId)
          .gte("created_at", date.toISOString())
          .lt("created_at", nextDate.toISOString()),
        admin
          .from("event_rsvps")
          .select("id", { count: "exact", head: true })
          .eq("community_id", communityId)
          .gte("created_at", date.toISOString())
          .lt("created_at", nextDate.toISOString()),
        admin
          .from("points_ledger")
          .select("delta")
          .eq("community_id", communityId)
          .gte("created_at", date.toISOString())
          .lt("created_at", nextDate.toISOString()),
      ]);

    const pointsEarned = (pointsRes.data ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, row: any) => sum + (row.delta ?? 0),
      0
    );

    dailyData.push({
      date: dateStr,
      newMembers: newMembersRes.count ?? 0,
      newPosts: newPostsRes.count ?? 0,
      newRsvps: newRsvpsRes.count ?? 0,
      pointsEarned,
    });
  }

  // 8. Top 10 fans by points
  const topFansRes = await admin
    .from("fan_community_memberships")
    .select(
      `
      fan_id,
      total_points,
      subscription_tier,
      fans:fans (
        first_name,
        last_name,
        avatar_url
      )
    `
    )
    .eq("community_id", communityId)
    .order("total_points", { ascending: false })
    .limit(10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topFans = (topFansRes.data ?? []).map((row: any) => {
    const fan = Array.isArray(row.fans) ? row.fans[0] : row.fans || {};
    return {
      fan_id: row.fan_id,
      first_name: fan.first_name,
      last_name: fan.last_name,
      avatar_url: fan.avatar_url,
      total_points: row.total_points,
      subscription_tier: row.subscription_tier,
    };
  });

  // 9. Recent subscription activity (last 10)
  const subscriptionsRes = await admin
    .from("fan_community_memberships")
    .select(
      `
      fan_id,
      subscription_tier,
      is_founder,
      founder_number,
      joined_at,
      current_period_end,
      fans:fans (
        first_name,
        last_name
      )
    `
    )
    .eq("community_id", communityId)
    .order("joined_at", { ascending: false })
    .limit(10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptions = (subscriptionsRes.data ?? []).map((row: any) => {
    const fan = Array.isArray(row.fans) ? row.fans[0] : row.fans || {};
    return {
      fan_id: row.fan_id,
      first_name: fan.first_name,
      last_name: fan.last_name,
      subscription_tier: row.subscription_tier,
      is_founder: row.is_founder,
      founder_number: row.founder_number,
      joined_at: row.joined_at,
      current_period_end: row.current_period_end,
    };
  });

  return {
    kpi: {
      totalMembers: totalRes.count ?? 0,
      premiumMembers: premiumRes.count ?? 0,
      foundersClaimed: foundersRes.count ?? 0,
      founderCap: community.founder_cap ?? 100,
      mrrCents,
      activeFansThisWeek: activeWeekRes.count ?? 0,
      totalPointsThisMonth,
    },
    daily: dailyData,
    topFans,
    subscriptions,
    community,
  };
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-xs uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="mt-1 text-xs text-white/50">{sub}</p>}
    </div>
  );
}

export default async function AdminCommunityAnalyticsPage({
  params,
}: {
  params: Promise<{ communityId: string }>;
}) {
  // Gate: admin check
  const ctx = await getAdminContext();
  if (!ctx) {
    notFound();
  }

  const { communityId } = await params;

  // Verify admin has access to this community
  if (
    !ctx.isSuperAdmin &&
    ctx.communities.length > 0 &&
    !ctx.communities.includes(communityId)
  ) {
    notFound();
  }

  const data = await getAnalyticsData(communityId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Analytics
        </h1>
        <p className="mt-1 text-sm text-white/60">
          {data.community.display_name} — community health dashboard
        </p>
      </div>

      {/* KPI Row */}
      <section>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/50">
          Key Metrics
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <KpiCard
            label="Total Members"
            value={data.kpi.totalMembers}
            sub={`${data.kpi.premiumMembers} premium/comped`}
          />
          <KpiCard
            label="MRR"
            value={formatCurrency(data.kpi.mrrCents)}
            sub={`${data.kpi.premiumMembers} subscriptions`}
          />
          <KpiCard
            label="Founders Claimed"
            value={`${data.kpi.foundersClaimed} / ${data.kpi.founderCap}`}
            sub={data.kpi.foundersClaimed >= data.kpi.founderCap ? "All slots full" : "Available"}
          />
          <KpiCard
            label="Active This Week"
            value={data.kpi.activeFansThisWeek}
            sub="With points earned"
          />
          <KpiCard
            label="Points (30d)"
            value={data.kpi.totalPointsThisMonth.toLocaleString()}
            sub="Earned by members"
          />
        </div>
      </section>

      {/* Founder Progress Bar */}
      <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="mb-3 text-sm font-semibold">Founder Slot Progress</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-white/70">
            <span>
              {data.kpi.foundersClaimed} of {data.kpi.founderCap} claimed
            </span>
            <span className="font-mono">
              {Math.round((data.kpi.foundersClaimed / data.kpi.founderCap) * 100)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full transition-all"
              style={{
                width: `${(data.kpi.foundersClaimed / data.kpi.founderCap) * 100}%`,
                backgroundImage: `linear-gradient(90deg, ${data.community.accent_from}, ${data.community.accent_to})`,
              }}
            />
          </div>
        </div>
      </section>

      {/* Recent Activity Trend */}
      <section className="rounded-2xl border border-white/10 bg-black/30 p-4">
        <p className="mb-3 text-sm font-semibold">Activity · Last 7 Days</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-white/50">
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2 text-right">New Members</th>
                <th className="px-2 py-2 text-right">New Posts</th>
                <th className="px-2 py-2 text-right">New RSVPs</th>
                <th className="px-2 py-2 text-right">Points Earned</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((row) => (
                <tr key={row.date} className="border-b border-white/5">
                  <td className="px-2 py-2 font-mono text-white/70">{row.date}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{row.newMembers}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{row.newPosts}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{row.newRsvps}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {row.pointsEarned.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top Fans & Recent Subscriptions */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="mb-3 text-sm font-semibold">Top Fans by Points</p>
          {data.topFans.length === 0 ? (
            <p className="text-xs text-white/50">No fans yet.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {data.topFans.map((fan) => (
                <div key={fan.fan_id} className="flex items-center gap-3 py-3">
                  {fan.avatar_url && (
                    <Image
                      src={fan.avatar_url}
                      alt={fan.first_name || "Fan"}
                      width={32}
                      height={32}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {fan.first_name} {fan.last_name}
                    </p>
                    <p className="text-xs text-white/50">{fan.subscription_tier}</p>
                  </div>
                  <p className="font-mono text-sm font-semibold tabular-nums text-right">
                    {fan.total_points.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="mb-3 text-sm font-semibold">Recent Subscriptions</p>
          {data.subscriptions.length === 0 ? (
            <p className="text-xs text-white/50">No recent activity.</p>
          ) : (
            <div className="divide-y divide-white/5">
              {data.subscriptions.map((sub) => (
                <div key={sub.fan_id} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">
                        {sub.first_name} {sub.last_name}
                      </p>
                      <p className="text-xs text-white/50 mt-0.5">
                        {sub.subscription_tier}
                        {sub.is_founder && (
                          <span className="ml-1 inline-block rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-semibold text-amber-300">
                            Founder #{sub.founder_number}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-white/50 mt-1">
                    Joined {formatDate(sub.joined_at)}
                    {sub.current_period_end && (
                      <> • Renews {formatDate(sub.current_period_end)}</>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
