import Link from "next/link";
import { listArtistsFromDb } from "@/lib/data/artists";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "Artists",
  description:
    "Browse artist fan experiences on Fan Engage and discover rewards, drops, events, and fan-only experiences. Follow the artists you love.",
  alternates: { canonical: "/artists" },
  openGraph: {
    type: "website",
    url: "/artists",
    siteName: "Fan Engage",
    title: "Artist Fan Experiences",
    description:
      "Follow artists, earn points, and unlock drops on every fan experience hosted by Fan Engage.",
  },
};

export const dynamic = "force-dynamic";

export default async function ArtistsIndexPage({ searchParams }: { searchParams?: Promise<{ genre?: string }> }) {
  const sp = (await searchParams) ?? {};
  const genreFilter = (sp.genre ?? null) as string | null;

  const artists = await listArtistsFromDb();
  const allGenres = Array.from(new Set(artists.flatMap((a) => a.genres))).sort();
  const filteredArtists = genreFilter
    ? artists.filter((a) => a.genres.includes(genreFilter))
    : artists;


  // Fan counts per community for social-proof display (M-14)
  const admin = createAdminClient();
  const { data: memberships } = await admin
    .from("fan_community_memberships")
    .select("community_id");
  const fanCounts: Record<string, number> = {};
  for (const m of (memberships ?? []) as Array<{ community_id: string }>) {
    fanCounts[m.community_id] = (fanCounts[m.community_id] ?? 0) + 1;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-white/60">Artists</p>
        <h1 className="text-3xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Fan Experiences on Fan Engage
        </h1>
        <p className="max-w-2xl text-sm text-white/70">
          Each artist has a dedicated hub with rewards, drops, and backstage access for their fans.
        </p>
      </header>

      
      {allGenres.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Filter by genre">
          <Link
            href="/artists"
            className={
              "inline-flex items-center rounded-full border px-3 py-1 text-xs transition " +
              (genreFilter === null
                ? "border-white/40 bg-white/15 text-white"
                : "border-white/10 bg-black/30 text-white/70 hover:border-white/30")
            }
          >
            All
          </Link>
          {allGenres.map((g) => (
            <a
              key={g}
              href={`/artists?genre=${encodeURIComponent(g)}`}
              className={
                "inline-flex items-center rounded-full border px-3 py-1 text-xs transition " +
                (genreFilter === g
                  ? "border-white/40 bg-white/15 text-white"
                  : "border-white/10 bg-black/30 text-white/70 hover:border-white/30")
              }
            >
              {g}
            </a>
          ))}
        </div>
      )}

      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filteredArtists.map((a) => (
          <Link
            key={a.slug}
            href={`/artists/${a.slug}`}
            className="group relative overflow-hidden rounded-3xl border border-white/10 transition hover:border-white/30 hover:-translate-y-0.5"
          >
            {/* 3:4 portrait poster — same shape as the Fan Home strip cards
                so the visual language stays consistent across the app. */}
            <div className="relative aspect-[3/4] w-full bg-black/40">
              {a.heroImage ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.heroImage}
                    alt=""
                    // object-top keeps the subject's head visible — default
                    // object-cover crops top + bottom equally, slicing heads.
                    className="absolute inset-0 h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.04]"
                    aria-hidden
                  />
                </>
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `linear-gradient(to bottom right, ${a.accentFrom}, ${a.accentTo})`,
                  }}
                  aria-hidden
                />
              )}

              {/* Dark gradient overlay so the text stays readable on any photo */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0) 100%)",
                }}
                aria-hidden
              />

              {/* Top-left genre chip */}
              {a.genres.length > 0 && (
                <p className="absolute left-5 top-5 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/85 backdrop-blur">
                  {a.genres.slice(0, 2).join(" · ")}{a.genres.length > 2 ? " +" + (a.genres.length - 2) : ""}
                </p>
              )}

              {/* Top-right fan count chip (M-14) */}
              {(fanCounts[a.slug] ?? 0) > 0 && (
                <p className="absolute right-5 top-5 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs uppercase tracking-[0.3em] text-white/85 backdrop-blur">
                  {fanCounts[a.slug].toLocaleString()} {fanCounts[a.slug] === 1 ? "fan" : "fans"}
                </p>
              )}

              {/* Bottom-left content: name + tagline + CTA arrow */}
              <div className="absolute inset-x-0 bottom-0 p-5">
                <h2
                  className="text-2xl font-semibold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {a.name}
                </h2>
                {a.tagline && (
                  <p className="mt-1 line-clamp-2 text-sm text-white/85 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
                    {a.tagline}
                  </p>
                )}
                <span className="mt-3 inline-flex text-sm text-white/90 transition group-hover:text-white">
                  Enter Fan Experience →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
