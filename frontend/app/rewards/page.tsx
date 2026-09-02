import Link from "next/link";
import AvatarUploadCard from "./avatar-upload-card";
import PreviewSignupBanner from "@/components/preview-signup-banner";
import { getBadgesWithEarnedStatus } from "@/lib/data/badges";
import {
  getCurrentFan,
  getCurrentFanKpis,
  getPointBreakdown,
} from "@/lib/data/fan";
import { getTiers, tierIcon } from "@/lib/data/tiers";
import type { Badge, BadgeCategory, TierSlug } from "@/lib/data/types";
import { isMarketplaceLive } from "@/lib/marketplace-live";
import { FOUNDING_FAN_RULE } from "@/lib/founding-fan-rule";
import { tierBadgeEarned, tierJourneyState } from "@/lib/tier-thresholds";

const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  welcome:   "Getting started",
  community: "Community",
  referral:  "Referrals",
  tier:      "Tier milestones",
};
const CATEGORY_ORDER: BadgeCategory[] = ["welcome", "community", "referral", "tier"];

type EarnMore = {
  title: string;
  detail: string;
  reward: string;
  href: string;
};
const earnMore: EarnMore[] = [
  { title: "Share referral link", detail: "Every verified signup", reward: "+150 pts", href: "/referrals" },
  {
    title: "Redeem digital unlocks",
    detail: "Wallpapers and in-app drops",
    reward: "—",
    href: "/artists/raelynn/rewards",
  },
  isMarketplaceLive()
    ? { title: "Browse marketplace", detail: "Redeem points for drops", reward: "—", href: "/marketplace" }
    : { title: "Merch — coming soon", detail: "Physical merch stays closed — digital path is above", reward: "—", href: "/marketplace" },
];

function formatPts(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US").format(n) + " pts";
}

export const metadata = { title: "Rewards" };

export default async function RewardsPage() {
  const [fan, kpis, tiers, dbBadges, breakdown] = await Promise.all([
    getCurrentFan(),
    getCurrentFanKpis(),
    getTiers(),
    getBadgesWithEarnedStatus(),
    getPointBreakdown(),
  ]);

  // Signed-in users see their real badges (empty until earned).
  // Guests get no fake Bronze/Gold progress chrome or preview numbers.
  const isSignedIn = fan !== null;
  const totalPoints = kpis?.total_points ?? 0;
  const badges: Badge[] = isSignedIn
    ? dbBadges.map((b) => ({
        ...b,
        earned: tierBadgeEarned({
          slug: b.slug,
          alreadyEarned: b.earned,
          totalPoints,
        }) || b.earned,
      }))
    : [];
  const earnedCount = badges.filter((b) => b.earned).length;
  const totalBadges = badges.length;

  // Group by category for the grid.
  const badgesByCategory = new Map<BadgeCategory, Badge[]>();
  for (const b of badges) {
    const cat = (b.category ?? "welcome") as BadgeCategory;
    const arr = badgesByCategory.get(cat) ?? [];
    arr.push(b);
    badgesByCategory.set(cat, arr);
  }

  const journey = isSignedIn
    ? tierJourneyState(kpis == null ? null : kpis.total_points, tiers, (fan?.current_tier ?? "bronze") as TierSlug)
    : [];
  const currentSlug =
    journey.find((t) => t.isCurrent)?.slug ??
    ((fan?.current_tier ?? "bronze") as TierSlug);
  const currentTier = tiers.find((t) => t.slug === currentSlug);
  const nextTier = isSignedIn ? (kpis?.next_tier ?? null) : null;
  const toNext =
    kpis?.points_to_next_tier ??
    (nextTier ? Math.max(0, nextTier.min_points - totalPoints) : 0);
  const nextThreshold =
    nextTier?.min_points ?? (currentTier?.min_points ?? 0) + toNext;
  const fromCurrent = currentTier?.min_points ?? 0;
  const pct = nextThreshold > fromCurrent
    ? Math.min(100, Math.max(0, ((totalPoints - fromCurrent) / (nextThreshold - fromCurrent)) * 100))
    : 100;

  return (
    <div className="min-h-screen bg-midnight">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 lg:flex-row">
        <div className="flex-1 space-y-6">
          {!isSignedIn && (
            <PreviewSignupBanner
              eyebrow="🎟️ Join to earn"
              headline="Sign up to start earning real points + climbing real tiers"
              body="Fans earn points by showing up — RSVPs, posts, referrals — and trade them for drops the casual crowd never gets. Your points, badges, and tier progress appear here after you join."
              bullets={[
                "Real points the moment you sign up — no minimum to start",
                "Badges that climb tiers and unlock fan-only perks",
                "First access to drops and event RSVPs",
              ]}
              primaryCta="Sign up free →"
              nextPath="/rewards"
              firstRewardLine="🎁 Earn your first 100 fan points the moment you sign up."
            />
          )}

          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-800/30 via-slate-900 to-midnight p-6 shadow-glass">
            <p className="text-sm uppercase tracking-wide text-white/60">Rewards & Tiers</p>
            {isSignedIn ? (
              <>
                <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  {nextTier
                    ? `${formatPts(toNext)} away from ${nextTier.display_name}`
                    : "You're at max tier"}
                </h1>
                <p className="mt-4 text-sm text-white/70">
                  Keep stacking points to unlock {nextTier?.display_name ?? "more"}-only experiences.
                  Silver unlocks priority digital drops + a leaderboard boost. Gold adds exclusive digital unlocks. Platinum opens the full digital catalog.
                </p>
                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-between text-sm text-white/70">
                    <span>{currentTier?.display_name ?? "Bronze"}</span>
                    <span>{formatPts(totalPoints)} / {formatPts(nextThreshold)}</span>
                  </div>
                  <div className="h-3 rounded-full bg-black/40">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-400"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs uppercase tracking-wide text-white/50">
                    {journey.map((t) => (
                      <span
                        key={t.slug}
                        className={`flex items-center gap-2 text-sm ${
                          t.isCurrent ? "text-white" : "text-white/60"
                        }`}
                      >
                        <span>{tierIcon(t.slug)}</span> {t.display_name}
                        <span className="normal-case tracking-normal text-white/45">
                          {t.lockLabel}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <h1 className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  Earn points by showing up
                </h1>
                <p className="mt-4 text-sm text-white/70">
                  Sign up to start earning. Your points, badges, and tier
                  progress land here after you join — plus digital unlocks
                  like wallpapers you can redeem.
                </p>
              </>
            )}
          </section>

          <section className="glass-card p-6">
            <p className="text-sm uppercase tracking-wide text-white/60">Founding Fan</p>
            <h2 className="mt-1 text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
              First 100 joins
            </h2>
            <p className="mt-2 text-sm text-white/70">{FOUNDING_FAN_RULE}</p>
          </section>

          <section className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-wide text-white/60">Badge gallery</p>
                <h2 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
                  {isSignedIn ? `${earnedCount} / ${totalBadges} unlocked` : "Your badges after you join"}
                </h2>
              </div>
              {isSignedIn && (
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-white/50">Progress</p>
                  <p className="text-sm font-semibold text-emerald-300">
                    {totalBadges > 0 ? Math.round((earnedCount / totalBadges) * 100) : 0}%
                  </p>
                </div>
              )}
            </div>
            {!isSignedIn ? (
              <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                <p className="text-sm font-semibold">Sign up to unlock badges</p>
                <p className="mt-2 text-xs text-white/60">
                  Post, refer friends, and show up — badges appear on your
                  account, not as a guest preview.
                </p>
              </div>
            ) : badges.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
                <p className="text-sm font-semibold">No badges yet</p>
                <p className="mt-2 text-xs text-white/60">
                  Complete missions and referrals to start earning badges.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-6">
                {CATEGORY_ORDER.map((cat) => {
                  const catBadges = badgesByCategory.get(cat) ?? [];
                  if (catBadges.length === 0) return null;
                  return (
                    <div key={cat} className="space-y-3">
                      <p className="text-xs uppercase tracking-wide text-white/50">
                        {CATEGORY_LABELS[cat]} · {catBadges.filter((b) => b.earned).length}/{catBadges.length}
                      </p>
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {catBadges.map((badge) => {
                          const hasThreshold = badge.threshold != null && badge.threshold > 0;
                          const progress = badge.progress ?? 0;
                          const pct = hasThreshold
                            ? Math.min(100, Math.round((progress / (badge.threshold ?? 1)) * 100))
                            : badge.earned ? 100 : 0;
                          return (
                            <div
                              key={badge.slug}
                              className={`rounded-2xl border p-5 ${
                                badge.earned
                                  ? "border-emerald-500/40 bg-emerald-500/10"
                                  : "border-white/10 bg-black/30"
                              }`}
                            >
                              <div className="flex items-start gap-4">
                                <span
                                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-3xl ${
                                    badge.earned
                                      ? "bg-gradient-to-br from-emerald-400/30 to-aurora/30 ring-1 ring-emerald-400/40"
                                      : "bg-gradient-to-br from-white/10 to-white/5 grayscale opacity-70"
                                  }`}
                                  aria-hidden
                                >
                                  {badge.icon ?? "🏅"}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold leading-tight">{badge.name}</p>
                                  <p className="mt-0.5 text-xs text-white/60">
                                    {badge.earned ? "Unlocked" : "Locked"}
                                    {badge.earned && badge.point_value > 0 && ` · +${badge.point_value} pts`}
                                  </p>
                                </div>
                              </div>
                              {badge.description && (
                                <p className="mt-2 text-xs text-white/60">{badge.description}</p>
                              )}
                              {hasThreshold && !badge.earned && isSignedIn && (
                                <div className="mt-3 space-y-1">
                                  <div className="h-1.5 rounded-full bg-black/40">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-aurora to-ember"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <p className="text-xs text-white/50">
                                    {progress} / {badge.threshold}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="w-full max-w-sm space-y-6">
          {isSignedIn && (
            <AvatarUploadCard
              initialUrl={fan?.avatar_url ?? null}
              firstName={fan?.first_name ?? null}
            />
          )}

          <section className="glass-card p-6">
            <p className="text-sm uppercase tracking-wide text-white/60">Earn more points</p>
            <div className="mt-4 space-y-4">
              {earnMore.map((item) => {
                const inner = (
                  <>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-white/60">{item.detail}</p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-sm font-semibold text-emerald-300">
                        {item.reward}
                      </span>
                      {item.href !== "#" && (
                        <span className="text-xs text-white/70">Start →</span>
                      )}
                    </div>
                  </>
                );
                return item.href === "#" ? (
                  <div key={item.title} className="rounded-2xl bg-black/30 p-4">
                    {inner}
                  </div>
                ) : (
                  <Link
                    key={item.title}
                    href={item.href}
                    className="block rounded-2xl bg-black/30 p-4 transition hover:bg-black/40"
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="glass-card p-6">
            <p className="text-sm uppercase tracking-wide text-white/60">Point breakdown</p>
            {isSignedIn ? (
              breakdown.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {breakdown.map((cat) => (
                    <div
                      key={cat.source}
                      className="flex items-center justify-between text-sm text-white/70"
                    >
                      <span>{cat.label}</span>
                      <span className="font-semibold text-white">
                        {new Intl.NumberFormat("en-US").format(cat.total)} pts
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4 text-center text-xs text-white/60">
                  Earn your first points to see a breakdown here.
                </div>
              )
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-4 text-center text-xs text-white/60">
                Sign up to see your real point breakdown. We do not show
                sample totals to guests.
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}
