import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { listArtists } from "@/lib/artists";
import { seedCommunityAction, getArtistSeedStatus } from "./actions";

export const dynamic = "force-dynamic";

export default async function CommunitySeedPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/community/seed");
  if (!ctx.isSuperAdmin) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-white/70">
          This page is super-admin only.
        </p>
      </main>
    );
  }

  const artists = listArtists();
  const slugs = artists.map((a) => a.slug);
  const postCounts = await getArtistSeedStatus(slugs);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/50">
          Admin · Community
        </p>
        <h1
          className="mt-1 text-3xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Seed community content
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Inserts a pinned welcome announcement, an engagement poll, and a fan
          challenge for each artist. Idempotent — re-running on an artist that
          already has posts is a no-op. Run once per artist before launch.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-xs uppercase tracking-wide text-white/60">
            <tr>
              <th className="px-4 py-3 text-left">Artist</th>
              <th className="px-4 py-3 text-left">Slug</th>
              <th className="px-4 py-3 text-left">Posts in DB</th>
              <th className="px-4 py-3 text-left">Seed content</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {artists.map((artist) => {
              const count = postCounts[artist.slug] ?? 0;
              const seeded = count > 0;
              return (
                <tr key={artist.slug} className="bg-black/20">
                  <td className="px-4 py-4">
                    <div className="font-semibold">{artist.name}</div>
                    <div className="text-xs text-white/50">{artist.tagline}</div>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-white/60">
                    {artist.slug}
                  </td>
                  <td className="px-4 py-4">
                    {seeded ? (
                      <span className="text-emerald-300">{count} posts</span>
                    ) : (
                      <span className="text-white/50">0 posts</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-xs text-white/60">
                    Announcement · Poll · Challenge
                  </td>
                  <td className="px-4 py-4 text-right">
                    {seeded ? (
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300">
                        ✓ Seeded
                      </span>
                    ) : (
                      <form action={seedCommunityAction}>
                        <input
                          type="hidden"
                          name="artist_slug"
                          value={artist.slug}
                        />
                        <button
                          type="submit"
                          className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-xs font-semibold text-white shadow-glass transition hover:brightness-110"
                        >
                          Seed content
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-white/50">
        After seeding, visit each artist community to confirm the posts render
        correctly, then pin or unpin as needed from{" "}
        <a href="/admin/community" className="underline hover:text-white/70">
          Community moderation
        </a>
        .
      </p>
    </main>
  );
}
