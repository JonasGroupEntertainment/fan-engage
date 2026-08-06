import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentFan, getCurrentFanKpis } from "@/lib/data/fan";
import { getTiers, tierIcon } from "@/lib/data/tiers";
import ShareButton from "@/components/share-button";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = { title: "My Fan Card" };

export default async function FanCardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/card");

  const [fan, kpis, tiers] = await Promise.all([
    getCurrentFan(),
    getCurrentFanKpis(),
    getTiers(),
  ]);
  if (!fan) redirect("/login?next=/me/card");

  const currentTier = fan.current_tier ?? "bronze";
  const currentTierData = tiers.find((t) => t.slug === currentTier);
  const nextTierData = kpis?.next_tier ?? null;
  const totalPoints = kpis?.total_points ?? fan.total_points ?? 0;

  const displayName =
    fan.first_name && fan.last_name
      ? `${fan.first_name} ${fan.last_name}`
      : fan.first_name ?? "Fan";

  const shareUrl =
    process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/fans/${fan.id}`
      : `https://fan-engage-pearl.vercel.app/fans/${fan.id}`;

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:py-16 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-white/60">Your card</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Fan Card</h1>
        <p className="mt-2 text-sm text-white/60">
          Share this to flex your tier and invite friends.
        </p>
      </header>

      {/* The card */}
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 p-8 shadow-glass"
        style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.3) 0%, #0f172a 50%, rgba(245,101,40,0.2) 100%)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-aurora/30 blur-3xl"
        />

        <div className="relative space-y-6">
          {/* Header row */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-white/50">
                Fan Engage Pro
              </p>
              <p className="mt-2 text-2xl font-semibold">{displayName}</p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">
                <span className="text-base">{tierIcon(currentTier)}</span>
                {currentTierData?.display_name ?? "Bronze"}
              </span>
            </div>
          </div>

          {/* Points */}
          <div>
            <p
              className="text-5xl font-semibold tabular-nums"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {totalPoints.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-white/50">total points</p>
          </div>

          {/* Progress to next tier */}
          {nextTierData && kpis?.points_to_next_tier != null && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-white/50">
                <span>{currentTierData?.display_name}</span>
                <span>{nextTierData.display_name}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-aurora to-ember transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      100 -
                        Math.round(
                          (kpis.points_to_next_tier /
                            (nextTierData.min_points - (currentTierData?.min_points ?? 0))) *
                            100,
                        ),
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs text-white/50">
                {kpis.points_to_next_tier.toLocaleString()} pts to{" "}
                {nextTierData.display_name}
              </p>
            </div>
          )}

          {/* Stats row */}
          <div className="flex gap-4 border-t border-white/10 pt-4 text-center">
            <div className="flex-1">
              <p className="text-lg font-semibold">{kpis?.badge_count ?? 0}</p>
              <p className="text-xs text-white/50">Badges</p>
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold">{kpis?.referral_count ?? 0}</p>
              <p className="text-xs text-white/50">Referrals</p>
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold">
                {currentTierData?.min_points?.toLocaleString() ?? "—"}
              </p>
              <p className="text-xs text-white/50">Tier min pts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <ShareButton
          title={`${displayName} — Fan Engage Pro`}
          text={`I'm a ${currentTierData?.display_name ?? "Bronze"} fan on Fan Engage Pro with ${totalPoints.toLocaleString()} points. Join me!`}
          url={shareUrl}
          variant="primary"
          label="Share my card"
        />
        <a
          href="/"
          className="block w-full rounded-full border border-white/15 py-3 text-center text-sm font-medium text-white/70 hover:bg-white/5 transition"
        >
          Back to home
        </a>
      </div>

      <p className="text-center text-xs text-white/35">
        View your public profile at{" "}
        <span className="text-white/55">/fans/{fan.id}</span>
      </p>
    </main>
  );
}
