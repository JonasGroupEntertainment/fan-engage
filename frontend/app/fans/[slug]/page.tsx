import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFanProfileBySlug } from "@/lib/data/fan-profile";
import ShareButton from "@/components/share-button";

export const dynamic = "force-dynamic";

const TIER_COLORS: Record<string, { from: string; to: string; label: string }> = {
  bronze: { from: "#a16207", to: "#fbbf24", label: "Bronze" },
  silver: { from: "#94a3b8", to: "#e2e8f0", label: "Silver" },
  gold: { from: "#ca8a04", to: "#fde68a", label: "Gold" },
  platinum: { from: "#e0e7ff", to: "#c7d2fe", label: "Platinum" },
};

function getTierStyle(tier: string) {
  return TIER_COLORS[tier.toLowerCase()] ?? TIER_COLORS.bronze;
}

function formatMemberSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long" });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getFanProfileBySlug(slug);
  if (!profile) return { title: "Fan profile" };

  const name = profile.firstName ?? profile.profileSlug;
  const founderCount = profile.founderBadges.length;
  const desc = founderCount
    ? `${name}'s fan experience profile · ${getTierStyle(profile.tier).label} tier · Founder for ${profile.founderBadges
        .map((f) => f.communityName)
        .join(", ")}`
    : `${name}'s fan experience profile · ${getTierStyle(profile.tier).label} tier · ${profile.totalPoints.toLocaleString()} points`;

  return {
    title: `${name}`,
    description: desc,
    alternates: { canonical: `/fans/${profile.profileSlug}` },
    openGraph: {
      type: "profile",
      url: `/fans/${profile.profileSlug}`,
      siteName: "Fan Engage",
      title: `${name}'s fan experience profile`,
      description: desc,
    },
    twitter: {
      card: "summary_large_image",
      title: `${name}'s fan experience profile`,
      description: desc,
    },
  };
}

export default async function FanProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getFanProfileBySlug(slug);
  if (!profile) notFound();

  const tier = getTierStyle(profile.tier);
  const initial = (profile.firstName?.[0] ?? "F").toUpperCase();
  const displayName = profile.firstName ?? profile.profileSlug;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app";
  const profileUrl = `${appUrl}/fans/${profile.profileSlug}`;
  const shareTitle = `${displayName}'s fan experience profile on Fan Engage`;
  const founderLine = profile.founderBadges.length
    ? `Founder for ${profile.founderBadges.map((f) => f.communityName).join(", ")}.`
    : "";
  const shareText = `${shareTitle}. ${founderLine} ${profile.totalPoints.toLocaleString()} pts · ${tier.label} tier. ${profileUrl}`;

  const socialHandle = profile.socials.instagram_or_tiktok?.trim();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <section
        className="relative overflow-hidden rounded-3xl border border-white/15 p-8 shadow-glass md:p-10"
        style={{
          background: `radial-gradient(circle at 15% 10%, ${tier.from}55, transparent 55%), radial-gradient(circle at 85% 95%, ${tier.to}55, transparent 60%), #050b1f`,
        }}
      >
        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center">
          {profile.avatarUrl ? (
            <Image
              src={profile.avatarUrl}
              alt={`${displayName} avatar`}
              width={96}
              height={96}
              className="h-24 w-24 rounded-full border-2 border-white/20 object-cover"
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/20 text-3xl font-bold"
              style={{
                backgroundImage: `linear-gradient(135deg, ${tier.from}, ${tier.to})`,
              }}
            >
              {initial}
            </div>
          )}
          <div className="flex-1">
            <p
              className="text-xs font-medium uppercase tracking-[0.3em]"
              style={{ color: tier.to }}
            >
              {tier.label} tier
            </p>
            <h1
              className="mt-2 text-3xl font-semibold leading-tight md:text-4xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {displayName}
            </h1>
            <p className="mt-2 text-sm text-white/65">
              @{profile.profileSlug} · Member since {formatMemberSince(profile.memberSince)}
            </p>
            {socialHandle && (
              <p className="mt-1 text-xs text-white/55">
                Find them on TikTok/Instagram: {socialHandle}
              </p>
            )}
          </div>
        </div>

        <div className="relative mt-8 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-2xl bg-white/5 px-3 py-4">
            <p className="text-2xl font-bold tabular-nums">
              {profile.totalPoints.toLocaleString()}
            </p>
            <p className="mt-1 text-xs text-white/60">total points</p>
          </div>
          <div className="rounded-2xl bg-white/5 px-3 py-4">
            <p className="text-2xl font-bold tabular-nums">
              {profile.founderBadges.length}
            </p>
            <p className="mt-1 text-xs text-white/60">founder badges</p>
          </div>
          <div className="rounded-2xl bg-white/5 px-3 py-4">
            <p className="text-2xl font-bold tabular-nums">
              {profile.communities.length}
            </p>
            <p className="mt-1 text-xs text-white/60">communities</p>
          </div>
        </div>

        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <ShareButton
            title={shareTitle}
            text={shareText}
            url={profileUrl}
            label="Share my profile"
            variant="primary"
          />
        </div>
      </section>

      {profile.founderBadges.length > 0 && (
        <section className="mt-12 space-y-4">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            🌟 Founding Fan
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {profile.founderBadges.map((f) => (
              <Link
                key={f.communitySlug}
                href={`/share/founder/${f.communitySlug}/${f.founderNumber}`}
                className="group relative overflow-hidden rounded-2xl border border-white/10 p-5 transition hover:border-white/30"
                style={{
                  background: `radial-gradient(circle at 15% 10%, ${f.accentFrom}33, transparent 60%), radial-gradient(circle at 85% 90%, ${f.accentTo}33, transparent 60%), rgba(255,255,255,0.03)`,
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-widest text-white/65">
                    Founder for
                  </p>
                  <p
                    className="text-3xl font-bold tabular-nums"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${f.accentFrom}, ${f.accentTo})`,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    #{f.founderNumber}
                  </p>
                </div>
                <p className="mt-2 text-lg font-semibold">{f.communityName}</p>
                <p className="mt-3 text-xs text-white/55 transition group-hover:text-white/80">
                  See badge →
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {profile.badges.length > 0 && (
        <section className="mt-12 space-y-4">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Badges earned
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profile.badges.map((b) => (
              <div
                key={b.slug + b.earnedAt}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                <p className="text-sm font-semibold">{b.name}</p>
                {b.description && (
                  <p className="mt-1 text-xs text-white/60 line-clamp-2">
                    {b.description}
                  </p>
                )}
                <p className="mt-3 text-xs text-white/45">
                  Earned{" "}
                  {new Date(b.earnedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {profile.communities.length > 0 && (
        <section className="mt-12 space-y-4">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Following
          </h2>
          <div className="flex flex-wrap gap-2">
            {profile.communities.map((c) => (
              <Link
                key={c.slug}
                href={`/artists/${c.slug}`}
                className="rounded-full border border-white/15 bg-black/30 px-4 py-1.5 text-sm text-white/85 hover:border-white/30 hover:bg-white/5"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      {profile.founderBadges.length === 0 &&
        profile.badges.length === 0 &&
        profile.communities.length === 0 && (
          <section className="mt-12 rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-sm text-white/70">
              {displayName} just joined Fan Engage. Their journey starts here.
            </p>
            <Link
              href="/artists"
              className="mt-4 inline-flex rounded-full border border-white/25 px-4 py-2 text-xs font-medium text-white/85 hover:bg-white/10"
            >
              Browse artists
            </Link>
          </section>
        )}

      {profile.recentPosts.length > 0 && (
        <section className="mt-12 space-y-4">
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Recent posts
          </h2>
          <div className="space-y-3">
            {profile.recentPosts.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-4"
              >
                {p.title && (
                  <p className="text-sm font-semibold text-white mb-1">{p.title}</p>
                )}
                {p.body && (
                  <p className="text-sm text-white/75 line-clamp-3 whitespace-pre-line">
                    {p.body}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between gap-2">
                  {p.artistName && p.artistSlug ? (
                    <Link
                      href={`/artists/${p.artistSlug}`}
                      className="text-xs text-white/50 hover:text-white/70 transition-colors"
                    >
                      {p.artistName} community
                    </Link>
                  ) : (
                    <span />
                  )}
                  <p className="text-xs text-white/35">
                    {new Date(p.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-16 rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
        <p className="text-sm font-medium text-white/85">
          Want a profile of your own?
        </p>
        <p className="mt-1 text-xs text-white/55">
          Follow artists, earn points, unlock drops and badges. Your fan experience
          profile builds itself.
        </p>
        <Link
          href="/artists"
          className="mt-4 inline-flex rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2.5 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
        >
          Find your artists →
        </Link>
      </section>
    </main>
  );
}
