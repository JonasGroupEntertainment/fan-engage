import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { getArtistFromDb } from "@/lib/data/artists";
import ShareButton from "@/components/share-button";
import { shareNumber } from "@/lib/share-number";

export const dynamic = "force-static";
export const revalidate = 3600;

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; rank: string }>;
}): Promise<Metadata> {
  const { slug, rank } = await params;
  const artist = await getArtistFromDb(slug).catch(() => null);
  const artistName = artist?.name ?? "Fan Engage";
  // Read strictly (lib/share-number.ts): typed words never reach the title.
  const rankNum = shareNumber(rank);
  if (!artist || rankNum === null) return { title: "Leaderboard", robots: { index: false } };
  const rankDisplay = ordinal(rankNum);
  const title = `${rankDisplay} on the ${artistName} leaderboard`;
  const description = `Ranked ${rankDisplay} in the ${artistName} fan community on Fan Engage. Earn points and climb the chart.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/share/rank/${slug}/${rankNum}`,
      siteName: "Fan Engage",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RankSharePage({
  params,
}: {
  params: Promise<{ slug: string; rank: string }>;
}) {
  const { slug, rank } = await params;
  const artist = await getArtistFromDb(slug).catch(() => null);
  if (!artist) notFound();

  const rankNum = shareNumber(rank);
  if (rankNum === null) notFound();
  const rankDisplay = ordinal(rankNum);

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/share/rank/${slug}/${rankNum}`
      : `https://fan-engage-pearl.vercel.app/share/rank/${slug}/${rankNum}`;
  const shareTitle = `I'm ranked ${rankDisplay} in the ${artist.name} fan community`;
  const shareText = `Climbing the leaderboard on Fan Engage — currently ${rankDisplay}. Can you beat me? ${shareUrl}`;

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
          <p className="text-xs tracking-widest uppercase text-white/50">Leaderboard</p>
          <div
            className="text-7xl font-extrabold leading-none"
            style={{
              background: `linear-gradient(135deg, ${artist.accentFrom}, ${artist.accentTo})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {rankDisplay}
          </div>
          <p className="text-white/60 text-sm mt-1">{artist.name} fan community</p>
        </div>
        <p className="text-white/60 text-sm max-w-xs">
          Earn points by engaging — posts, RSVPs, referrals, early badges. Climb the chart.
        </p>
        <ShareButton
          title={shareTitle}
          text={shareText}
          url={shareUrl}
          label="Share my rank"
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
          Join {artist.name}&apos;s community on Fan Engage and start earning your spot.
        </p>
      </div>
    </main>
  );
}
