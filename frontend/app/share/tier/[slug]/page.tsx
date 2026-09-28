import { notFound } from "next/navigation";
import { type Metadata } from "next";
import Link from "next/link";
import { getArtistFromDb } from "@/lib/data/artists";
import ShareButton from "@/components/share-button";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistFromDb(slug).catch(() => null);
  const artistName = artist?.name ?? "Fan Engage";
  const title = `Premium Fan — ${artistName}`;
  const description = `Unlocked the Premium tier for ${artistName} on Fan Engage: backstage feed, 1.5x points and rewards. Early drops and a monthly AMA are coming soon.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/share/tier/${slug}`,
      siteName: "Fan Engage",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function TierSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const artist = await getArtistFromDb(slug).catch(() => null);
  if (!artist) notFound();

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/share/tier/${slug}`
      : `https://fan-engage-pearl.vercel.app/share/tier/${slug}`;
  const shareTitle = `I just unlocked Premium for ${artist.name}`;
  const shareText = `Backstage feed, 1.5x points and rewards, with early drops and a monthly AMA coming soon. I'm a Premium fan for ${artist.name} on Fan Engage. ${shareUrl}`;

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
        <div
          className="text-7xl leading-none"
          style={{
            background: `linear-gradient(135deg, ${artist.accentFrom}, ${artist.accentTo})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          ★
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-xs tracking-widest uppercase text-white/50">Premium Fan</p>
          <h1 className="text-3xl font-bold">{artist.name}</h1>
        </div>
        <p className="text-white/60 text-sm max-w-xs">
          Backstage feed, 1.5x points, rewards and the full community. Early drops and a monthly AMA are coming soon.
        </p>
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
          Join {artist.name}&apos;s community on Fan Engage and unlock your own Premium tier.
        </p>
      </div>
    </main>
  );
}
