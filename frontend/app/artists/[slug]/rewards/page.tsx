import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getArtistFromDb } from "@/lib/data/artists";
import { listRewardsForCommunity, listMyRedemptions } from "@/lib/data/rewards";
import Image from "next/image";
import RewardCardWithForm from "./reward-card";
import { getFanProfileSlug } from "@/lib/data/fan-profile";
import RecommendedRewardCard from "./recommended-reward-card";
import { recommendReward } from "@/lib/recs";
import { MarketplaceEmptyState, MIN_INVENTORY } from "@/components/marketplace-empty-state";


export const dynamic = "force-dynamic";

async function getFanPoints(userId: string, _communityId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fan_ledger_balance", {
    p_fan_id: userId,
  });
  if (!error && typeof data === "number") return data;
  const { data: rows } = await admin
    .from("points_ledger")
    .select("delta")
    .eq("fan_id", userId);
  return (rows ?? []).reduce((sum, r) => sum + ((r.delta as number) ?? 0), 0);
}

async function FanPoints({ userId, communityId }: { userId: string; communityId: string }) {
  const points = await getFanPoints(userId, communityId);
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-2">
      <p className="text-xs uppercase tracking-wide text-white/60">Your Points</p>
      <p className="mt-1 text-2xl font-bold text-white">
        {points.toLocaleString()}
      </p>
    </div>
  );
}

export default async function RewardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ dismiss_rec?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const dismissRec = sp?.dismiss_rec === "1";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Soft-launch: new fans following a rewards link should hit signup, not
    // the returning-fan login door. Carry next so onboarding can return here.
    return redirect(
      `/signup?ref=${encodeURIComponent(slug)}&next=${encodeURIComponent(`/artists/${slug}/rewards`)}`,
    );
  }

  const artist = await getArtistFromDb(slug);
  if (!artist) return notFound();

  const [rewards, myRedemptions, rec, fanHandle, fanPoints] = await Promise.all([
    listRewardsForCommunity(slug),
    listMyRedemptions(user.id),
    dismissRec
      ? Promise.resolve(null)
      : recommendReward({ fanId: user.id, communityId: slug }),
    getFanProfileSlug(user.id).catch(() => null),
    getFanPoints(user.id, slug),
  ]);

  if (rewards.length < MIN_INVENTORY) {
    return (
      <div className="min-h-screen bg-midnight px-4 py-8">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Rewards · {artist.name}
          </h1>
          <p className="mt-2 mb-8 text-sm text-white/60">Spend your points on exclusive perks from {artist.name}.</p>
          <MarketplaceEmptyState scopeName={artist.name} />
        </div>
      </div>
    );
  }

  const recentRedemptions = myRedemptions.slice(0, 5);

  return (
    <div className="min-h-screen bg-midnight px-4 py-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
            Rewards · {artist.name}
          </h1>
          <p className="mt-2 text-sm text-white/60">Spend your points on exclusive perks from {artist.name}</p>
        </div>

        {/* Points Balance */}
        <div className="mb-6">
          <FanPoints userId={user.id} communityId={slug} />
        </div>

        {/* Recommended hero card (Phase 10) */}
        {rec && (
          <RecommendedRewardCard
            reward={rec}
            artistSlug={slug}
            dismissHref={`/artists/${slug}/rewards?dismiss_rec=1`}
          />
        )}

        {/* Rewards Grid */}
        {rewards.length > 0 ? (
          <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rewards.map((reward) => (
              <RewardCardWithForm key={reward.id} reward={reward} artistSlug={slug} artistName={artist.name} fanHandle={fanHandle} fanPoints={fanPoints} />
            ))}
          </div>
        ) : (
          <div className="glass-card mb-12 rounded-2xl p-8 text-center">
            <p className="text-sm text-white/60">No rewards available yet. Check back soon!</p>
          </div>
        )}

        {/* My Redemptions */}
        {recentRedemptions.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 text-lg font-semibold">Your Recent Redemptions</h2>
            <div className="space-y-2">
              {recentRedemptions.map((r) => (
                <div
                  key={r.id}
                  className="glass-card flex items-center justify-between rounded-lg p-4"
                >
                  <div>
                    <p className="text-sm font-medium">{r.reward.title}</p>
                    <p className="text-xs text-white/60">
                      {r.point_cost.toLocaleString()} points • {r.status}
                    </p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                      r.status === "fulfilled"
                        ? "bg-green-500/20 text-green-300"
                        : r.status === "cancelled"
                          ? "bg-red-500/20 text-red-300"
                          : "bg-yellow-500/20 text-yellow-300"
                    }`}
                  >
                    {r.status === "fulfilled"
                      ? "Fulfilled"
                      : r.status === "cancelled"
                        ? "Cancelled"
                        : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
