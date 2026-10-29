import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { getArtistFromDb } from "@/lib/data/artists";
import { createAdminClient } from "@/lib/supabase/admin";
import ShareButton from "@/components/share-button";
import { isFoundingFanBadgeSlug } from "@/lib/founding-fan-badge";
import { publicFoundingFanDescription } from "@/lib/founding-fan-rule";
import { TIER_MIN_POINTS, tierBadgeDescription } from "@/lib/tier-thresholds";
import type { TierSlug } from "@/lib/data/types";

export const dynamic = "force-static";
export const revalidate = 3600;

/**
 * Same rewrite as `publicBadgeDescription` in lib/data/badges.ts: tier and
 * Founding Fan rows still carry the old 2,500 / 10,000 / 25,000 copy, so
 * the public share card must never print `badges.description` raw.
 */
function publicBadgeDescription(slug: string, raw: string | null): string | null {
  if (isFoundingFanBadgeSlug(slug)) return publicFoundingFanDescription(raw);
  const tierSlug = slug.replace(/^tier-/, "") as TierSlug;
  if (tierSlug in TIER_MIN_POINTS) {
    return tierBadgeDescription(slug, TIER_MIN_POINTS[tierSlug]) ?? raw;
  }
  return raw;
}

async function getBadge(badgeSlug: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("badges")
    .select("name, description, icon")
    .eq("slug", badgeSlug)
    .maybeSingle();
  if (!data) return data;
  return {
    ...data,
    description: publicBadgeDescription(badgeSlug, (data.description as string | null) ?? null),
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; badge: string }>;
}): Promise<Metadata> {
  const { slug, badge: badgeSlug } = await params;
  const [artist, badgeRow] = await Promise.all([
    getArtistFromDb(slug).catch(() => null),
    getBadge(badgeSlug),
  ]);
  const artistName = artist?.name ?? "Fan Engage";
  const badgeName = badgeRow?.name ?? "Badge";
  const title = `${badgeName} — ${artistName}`;
  const description =
    badgeRow?.description ??
    `Earned the ${badgeName} badge for ${artistName} on Fan Engage.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/share/badge/${slug}/${badgeSlug}`,
      siteName: "Fan Engage",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BadgeSharePage({
  params,
}: {
  params: Promise<{ slug: string; badge: string }>;
}) {
  const { slug, badge: badgeSlug } = await params;
  const [artist, badgeRow] = await Promise.all([
    getArtistFromDb(slug).catch(() => null),
    getBadge(badgeSlug),
  ]);
  if (!artist) notFound();

  const badgeName = badgeRow?.name ?? "Badge";
  const badgeIcon = badgeRow?.icon ?? "🏆";
  const badgeDesc = badgeRow?.description ?? `Earned on Fan Engage`;

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/share/badge/${slug}/${badgeSlug}`
      : `https://fan-engage-pearl.vercel.app/share/badge/${slug}/${badgeSlug}`;
  const shareTitle = `I earned the ${badgeName} badge for ${artist.name}`;
  const shareText = `${badgeDesc} — ${shareUrl}`;

  return (
    <main className="min-h-screen bg-[#050b1f] text-white flex flex-col items-center justify-center px-6 py-16">
      <div
        className="w-full max-w-lg rounded-2xl border border-white/20 p-8 flex flex-col items-center gap-6 text-center"
        style={{
          background:
            `radial-gradient(circle at 20% 15%, ${artist.accentFrom}66, transparent 55%), ` +
            `radial-gradient(circle at 80% 85%, ${artist.accentTo}66, transparent 60%), ` +
            "rgba(255,255,255,0.03)",
          boxShadow: `0 0 60px ${artist.accentFrom}22`,
        }}
      >
        <p className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-medium">Fan Engage</p>
        <div className="text-7xl leading-none">{badgeIcon}</div>
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-widest uppercase text-white/50">Badge Unlocked</p>
          <h1
            className="text-3xl font-bold"
            style={{
              background: `linear-gradient(135deg, ${artist.accentFrom}, ${artist.accentTo})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {badgeName}
          </h1>
          <p className="text-white/60 text-sm">for {artist.name}</p>
        </div>
        <p className="text-white/60 text-sm max-w-xs">{badgeDesc}</p>
        <ShareButton
          title={shareTitle}
          text={shareText}
          url={shareUrl}
          label="Share this"
          variant="primary"
        />
      </div>

      <div className="mt-8 flex flex-col items-center gap-3">
        <Link
          href={`/artists/${artist.slug}`}
          className="text-sm text-white/50 hover:text-white transition-colors"
        >
          Visit fan experience →
        </Link>
        <p className="text-xs text-white/30 max-w-xs text-center">
          Earn your own badges by engaging with {artist.name}&apos;s community on Fan Engage.
        </p>
      </div>
    </main>
  );
}
