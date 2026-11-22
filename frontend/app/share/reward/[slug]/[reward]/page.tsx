import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { getArtistFromDb } from "@/lib/data/artists";
import { getShareableReward } from "@/lib/data/reward-share";
import { SHARE_PAGE_PREMIUM_NOTE, pointsLabel, rewardShareCopy, rewardSharePath } from "@/lib/reward-share";
import ShareButton from "@/components/share-button";

// Built once per reward and refreshed every ten minutes, like the other
// share pages, so a reward that is switched off leaves this public page
// within ten minutes. force-static also means no visitor session is read.
export const dynamic = "force-static";
export const revalidate = 600;

type RouteParams = Promise<{ slug: string; reward: string }>;

export async function generateMetadata({ params }: { params: RouteParams }): Promise<Metadata> {
  const { slug, reward: rewardId } = await params;
  const [artist, reward] = await Promise.all([
    getArtistFromDb(slug).catch(() => null),
    getShareableReward(slug, rewardId),
  ]);
  if (!artist || !reward) return { title: "Reward", robots: { index: false } };
  const { title, description } = rewardShareCopy({
    rewardTitle: reward.title,
    artistName: artist.name,
    pointCost: reward.point_cost,
  });
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: rewardSharePath(slug, reward.id),
      siteName: "Fan Engage",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RewardSharePage({ params }: { params: RouteParams }) {
  const { slug, reward: rewardId } = await params;
  const [artist, reward] = await Promise.all([
    getArtistFromDb(slug).catch(() => null),
    getShareableReward(slug, rewardId),
  ]);
  if (!artist || !reward) notFound();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app").replace(/\/+$/, "");
  const shareUrl = `${appUrl}${rewardSharePath(artist.slug, reward.id)}`;
  const cost = pointsLabel(reward.point_cost);
  const shareTitle = `${reward.title} from ${artist.name}`;
  const shareText = `${reward.title} is a fan reward from ${artist.name} for ${cost}. Join free and start earning points. ${shareUrl}`;

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
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-widest uppercase text-white/50">Fan reward</p>
          <h1 className="text-3xl font-bold">{reward.title}</h1>
          <p className="text-sm text-white/70">
            {artist.name} · {cost}
          </p>
        </div>
        {reward.description && <p className="text-white/60 text-sm max-w-xs">{reward.description}</p>}
        <Link
          href={`/artists/${artist.slug}`}
          className="rounded-full bg-gradient-to-r from-aurora to-ember px-6 py-3 text-sm font-semibold text-white shadow-glass transition hover:brightness-110"
        >
          Join free and start earning →
        </Link>
        <ShareButton title={shareTitle} text={shareText} url={shareUrl} label="Share this" variant="ghost" />
      </div>

      <p className="mt-8 text-xs text-white/50 max-w-xs text-center">
        Fans of {artist.name} earn points for showing up and taking part. {SHARE_PAGE_PREMIUM_NOTE}
      </p>
    </main>
  );
}
