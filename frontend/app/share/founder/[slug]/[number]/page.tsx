import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArtistFromDb } from "@/lib/data/artists";
import ShareButton from "@/components/share-button";

// ─── Public founder share page ──────────────────────────────────────────
// Anyone with the URL can see the badge — founder counts are public,
// fan identity is not exposed (we only encode artist + number, not the
// fan_id). The matching opengraph-image.tsx renders the certificate
// preview when this URL is shared.

export const dynamic = "force-static";
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}): Promise<Metadata> {
  const { slug, number } = await params;
  const artist = await getArtistFromDb(slug).catch(() => null);
  const artistName = artist?.name ?? "Fan Engage";
  const title = `Founder #${number} for ${artistName}`;
  const description = `One of 100 founding fans for ${artistName} on Fan Engage. Founder tier — points multiplier, early drops, founder-only experiences.`;
  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url: `/share/founder/${slug}/${number}`,
      siteName: "Fan Engage",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function FounderSharePage({
  params,
}: {
  params: Promise<{ slug: string; number: string }>;
}) {
  const { slug, number } = await params;
  const artist = await getArtistFromDb(slug).catch(() => null);
  if (!artist) notFound();

  const founderNumber = parseInt(number, 10);
  if (!Number.isFinite(founderNumber) || founderNumber < 1) notFound();

  const accentStyle = {
    backgroundImage: `linear-gradient(135deg, ${artist.accentFrom}, ${artist.accentTo})`,
  };

  const shareUrl =
    typeof process.env.NEXT_PUBLIC_APP_URL === "string"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/share/founder/${slug}/${founderNumber}`
      : `https://fan-engage-pearl.vercel.app/share/founder/${slug}/${founderNumber}`;

  const shareTitle = `I'm Founder #${founderNumber} for ${artist.name}`;
  const shareText = `One of 100 founding fans on Fan Engage. Catch up: ${shareUrl}`;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <section
        className="relative overflow-hidden rounded-3xl border border-white/20 p-10 shadow-glass md:p-14"
        style={{
          background: `radial-gradient(circle at 15% 10%, ${artist.accentFrom}66, transparent 55%), radial-gradient(circle at 85% 95%, ${artist.accentTo}66, transparent 60%), #050b1f`,
          boxShadow: `0 0 60px ${artist.accentFrom}22`,
        }}
      >
        <div className="relative flex flex-col items-center gap-6 text-center">
          <p className="text-[10px] tracking-[0.2em] uppercase text-white/30 font-medium">Fan Engage</p>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-white/70">
            Founding Fan
          </p>
          <p
            className="bg-clip-text text-[120px] font-extrabold leading-none tracking-tight text-transparent md:text-[180px]"
            style={accentStyle}
          >
            #{founderNumber}
          </p>
          <p
            className="text-3xl font-semibold leading-tight md:text-4xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            for {artist.name}
          </p>
          <p className="max-w-xl text-sm text-white/70">
            One of 100 founding fans for {artist.name} on Fan Engage. Founder
            tier comes with a points multiplier, early access to drops, and
            founder-only experiences.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <ShareButton
              title={shareTitle}
              text={shareText}
              url={shareUrl}
              label="Share this"
              variant="primary"
            />
            <Link
              href={`/artists/${artist.slug}`}
              className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-medium text-white/85 hover:bg-white/10"
            >
              Visit fan experience →
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-white/75 md:p-8">
        <p className="font-medium text-white/90">
          Want to claim a slot for {artist.name}?
        </p>
        <p className="mt-2">
          Founders are capped at 100 per artist. They earn points 1.5x faster,
          unlock founder-only drops, and get first access to events.{" "}
          <Link
            href={`/artists/${artist.slug}`}
            className="text-aurora underline hover:text-white"
          >
            See what&apos;s live for {artist.name} →
          </Link>
        </p>
      </section>
    </main>
  );
}
