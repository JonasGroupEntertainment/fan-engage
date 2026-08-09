import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import EntryActions from "./entry-actions";

export const dynamic = "force-dynamic";

type ChallengeWithEntries = {
  id: string;
  artist_slug: string;
  title: string | null;
  body: string;
  created_at: string;
  pinned: boolean;
  entries: Array<{
    id: string;
    fan_id: string;
    fan_first_name: string | null;
    body: string | null;
    image_url: string | null;
    created_at: string;
  }>;
  winner_id: string | null;
};

async function load(): Promise<ChallengeWithEntries[]> {
  const admin = createAdminClient();
  const { data: posts } = await admin
    .from("community_posts")
    .select("id,artist_slug,title,body,pinned,created_at")
    .eq("kind", "challenge")
    .order("created_at", { ascending: false })
    .limit(50);
  if (!posts || posts.length === 0) return [];
  const ids = posts.map((p) => p.id as string);
  const [{ data: entries }, { data: fans }, { data: winners }] = await Promise.all([
    admin
      .from("community_challenge_entries")
      .select("id,post_id,fan_id,body,image_url, image_alt,created_at")
      .in("post_id", ids)
      .order("created_at", { ascending: false }),
    admin.from("fans").select("id,first_name"),
    admin
      .from("campaign_items")
      .select("metadata,ref_id")
      .eq("item_kind", "challenge_winner")
      .in("ref_id", ids),
  ]);
  const nameById = new Map<string, string | null>(
    (fans ?? []).map((f) => [f.id as string, (f.first_name as string | null) ?? null]),
  );
  const entriesByPost = new Map<string, ChallengeWithEntries["entries"]>();
  for (const e of entries ?? []) {
    const pid = e.post_id as string;
    const arr = entriesByPost.get(pid) ?? [];
    arr.push({
      id: e.id as string,
      fan_id: e.fan_id as string,
      fan_first_name: nameById.get(e.fan_id as string) ?? null,
      body: (e.body as string | null) ?? null,
      image_url: (e.image_url as string | null) ?? null,
      created_at: e.created_at as string,
    });
    entriesByPost.set(pid, arr);
  }
  const winnerByPost = new Map<string, string>();
  for (const w of winners ?? []) {
    const meta = (w.metadata ?? {}) as { fan_id?: string };
    if (meta.fan_id && w.ref_id) winnerByPost.set(w.ref_id as string, meta.fan_id);
  }

  return posts.map((p) => ({
    id: p.id as string,
    artist_slug: p.artist_slug as string,
    title: (p.title as string | null) ?? null,
    body: p.body as string,
    pinned: p.pinned as boolean,
    created_at: p.created_at as string,
    entries: entriesByPost.get(p.id as string) ?? [],
    winner_id: winnerByPost.get(p.id as string) ?? null,
  }));
}

export default async function AdminChallengesPage() {
  const challenges = await load();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Challenges review
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Every active challenge and its entries. Pick a winner to grant a bonus badge + points.
        </p>
      </div>

      {challenges.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center">
          <p className="text-sm font-semibold">No challenges yet.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {challenges.map((c) => (
            <section key={c.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide text-white/70">
                      /{c.artist_slug}
                    </span>
                    {c.winner_id && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs uppercase tracking-wide text-emerald-200">
                        Winner picked
                      </span>
                    )}
                  </div>
                  {c.title && <h2 className="mt-1 text-lg font-semibold">{c.title}</h2>}
                  <p className="mt-1 text-sm text-white/70 line-clamp-2">{c.body}</p>
                </div>
                <Link
                  href={`/artists/${c.artist_slug}/community`}
                  className="text-xs text-white/60 hover:text-white"
                >
                  View live →
                </Link>
              </header>

              {c.entries.length === 0 ? (
                <p className="mt-3 text-xs text-white/50">No entries yet.</p>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {c.entries.map((e) => {
                    const isWinner = c.winner_id === e.fan_id;
                    return (
                      <div
                        key={e.id}
                        className={`rounded-xl border p-3 ${
                          isWinner
                            ? "border-emerald-500/50 bg-emerald-500/10"
                            : "border-white/10 bg-black/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/admin/fans/${e.fan_id}`}
                            className="text-xs font-semibold hover:text-white"
                          >
                            {e.fan_first_name ?? "Anonymous"}
                            {isWinner && " 🏆"}
                          </Link>
                          <span className="text-xs text-white/50">
                            {new Date(e.created_at).toLocaleString()}
                          </span>
                        </div>
                        {e.body && (
                          <p className="mt-2 text-sm text-white/80 line-clamp-3">{e.body}</p>
                        )}
                        {e.image_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={e.image_url}
                            alt=""
                            className="mt-2 max-h-48 w-full rounded-lg object-cover"
                          />
                        )}
                        <EntryActions
                          postId={c.id}
                          entryId={e.id}
                          fanId={e.fan_id}
                          hasWinner={Boolean(c.winner_id)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
