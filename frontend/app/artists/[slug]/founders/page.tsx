import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { listArtists } from "@/lib/artists";
import { getArtistFromDb } from "@/lib/data/artists";
import {
  FOUNDING_FAN_CAP,
  getFoundingFanClaimState,
  listFoundingFans,
} from "@/lib/data/founding-fans";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return listArtists().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistFromDb(slug);
  if (!artist) return { title: "Founder Wall" };
  return {
    title: `Founding Fans · ${artist.name}`,
    description: `See the founding fans of ${artist.name} — the first ${FOUNDING_FAN_CAP} fans with a numbered badge and 1.5× points.`,
  };
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

function getInitial(name: string | null): string {
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

export default async function FounderWallPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [artist, claim, founders] = await Promise.all([
    getArtistFromDb(slug),
    getFoundingFanClaimState(slug),
    listFoundingFans(slug),
  ]);

  if (!artist) notFound();

  const claimedCount = claim.claimed;
  const remainingCount = claim.remaining;
  const founderCap = claim.cap;
  const isFull = claim.closed;
  const signupHref = `/signup?ref=${encodeURIComponent(slug)}`;

  const heroGradient = `linear-gradient(to bottom right, ${artist.accentFrom}66, #0f172a, #000000)`;
  const numberGradient = (index: number) =>
    `linear-gradient(135deg, ${artist.accentFrom}, ${artist.accentTo})`;

  return (
    <main className="mx-auto max-w-7xl space-y-10 px-6 py-12">
      <section
        className="relative overflow-hidden rounded-3xl border border-white/10 p-10"
        style={{ backgroundImage: heroGradient }}
      >
        <p className="text-xs uppercase tracking-[0.3em] text-white/60">
          Founding Fans
        </p>
        <h1
          className="mt-3 text-4xl font-semibold leading-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Founding Fans of {artist.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-white/80">
          Free badge for the first {founderCap} joins — numbered status and
          1.5× points. Not a paid purchase. Premium ($10/mo or $99/yr) is a
          separate plan.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm text-white/60">Founding Fan spots</p>
            <p className="mt-1 text-3xl font-semibold">
              {claimedCount} <span className="text-lg text-white/60">/ {founderCap}</span>
            </p>
          </div>
          <div className="text-right">
            {isFull ? (
              <p className="text-sm font-semibold text-amber-400">
                All founding spots claimed
              </p>
            ) : (
              <>
                <p className="text-3xl font-semibold text-emerald-400">
                  {remainingCount}
                </p>
                <p className="mt-1 text-xs text-white/60">
                  {remainingCount === 1 ? "spot" : "spots"} remaining
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {founders.length === 0 ? (
        <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-12 text-center">
          <p className="text-lg font-semibold">Be the first.</p>
          <p className="mt-2 text-sm text-white/70">
            Founding Fan spots #{1}–{founderCap} are open. Join and lock a
            numbered badge plus 1.5× points.
          </p>
          <Link
            href={signupHref}
            className="mt-6 inline-block rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:brightness-110"
          >
            Claim founding status →
          </Link>
        </section>
      ) : (
        <section>
          <p className="mb-6 text-sm text-white/60">
            {claimedCount} {claimedCount === 1 ? "founding fan" : "founding fans"}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {founders.map((founder) => (
              <div
                key={founder.fan_id}
                className="group rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-4 text-center transition hover:bg-white/10 hover:border-white/20"
              >
                <div
                  className="relative mb-3 text-2xl font-bold text-transparent bg-clip-text"
                  style={{ backgroundImage: numberGradient(founder.founding_fan_number) }}
                >
                  #{founder.founding_fan_number}
                </div>

                <div className="mb-3 flex justify-center">
                  {founder.avatar_url ? (
                    <Image
                      src={founder.avatar_url}
                      alt={founder.first_name || `Founding Fan #${founder.founding_fan_number}`}
                      width={56}
                      height={56}
                      className="rounded-full object-cover border border-white/10 group-hover:border-white/20"
                    />
                  ) : (
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 group-hover:border-white/20 text-lg font-semibold text-white/70"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${artist.accentFrom}20, ${artist.accentTo}20)`,
                      }}
                    >
                      {getInitial(founder.first_name)}
                    </div>
                  )}
                </div>

                <p className="text-sm font-semibold text-white truncate">
                  {founder.first_name || `Founding Fan #${founder.founding_fan_number}`}
                </p>

                <p className="mt-2 text-xs text-white/50">
                  Member since {formatDate(founder.joined_at)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-8 text-center">
        <p className="text-lg font-semibold">
          {isFull
            ? "Founding Fan spots are full"
            : "Want to be a Founding Fan?"}
        </p>
        <p className="mt-2 text-sm text-white/70">
          {isFull
            ? "The first 100 numbered badges are claimed. You can still join and earn points."
            : "Join the first founding fans — numbered badge and 1.5× points."}
        </p>
        <Link
          href={isFull ? `/signup?ref=${encodeURIComponent(slug)}` : signupHref}
          className="mt-6 inline-block rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:brightness-110"
        >
          {isFull ? "Join anyway →" : "Claim founding status →"}
        </Link>
      </section>

      <div className="text-center">
        <Link
          href={`/artists/${slug}`}
          className="text-xs text-white/50 hover:text-white/70 transition"
        >
          ← Back to {artist.name}
        </Link>
      </div>
    </main>
  );
}
