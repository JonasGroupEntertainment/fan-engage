/**
 * /search?q=<query>
 *
 * Global semantic search results page. Server component — calls
 * lib/search.search() directly (no need to round-trip via /api/search;
 * that route exists for client-side / mobile / external callers).
 *
 * Empty / too-short queries render the prompt page; otherwise render
 * grouped results. We rely on lib/search to filter by visibility and
 * drop auto_hide content.
 */

import Link from "next/link";
import { search } from "@/lib/search";
import { EmbeddingError } from "@/lib/embeddings";
import type { SearchHit, SearchResults } from "@/lib/search";
import SearchInput from "@/components/search-input";
import { absoluteDate } from "@/lib/format/relative-time";

export const dynamic = "force-dynamic";

interface PageProps {
  // Next 15+: searchParams is a Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = params?.q;
  const query = (Array.isArray(raw) ? raw[0] : raw ?? "").toString().trim();

  // Empty / placeholder state.
  if (!query) {
    return <Shell query="">{<EmptyPrompt />}</Shell>;
  }

  let results: SearchResults | null = null;
  let errorMsg: string | null = null;
  try {
    results = await search(query);
  } catch (err) {
    if (err instanceof EmbeddingError) {
      errorMsg = "Search is temporarily unavailable. Please try again in a moment.";
    } else {
      errorMsg = "Search failed. Please try again.";
      console.error("[/search] failed:", err);
    }
  }

  return (
    <Shell query={query}>
      {errorMsg ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
          {errorMsg}
        </div>
      ) : results && results.totalHits === 0 ? (
        <NoResults query={query} />
      ) : results ? (
        <ResultsGrouped results={results} />
      ) : null}
    </Shell>
  );
}

function Shell({ query, children }: { query: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-midnight">
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
        <header className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-white/60">Search</p>
          <h1
            className="text-3xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {query ? `Results for “${query}”` : "Search Fan Engage"}
          </h1>
          <SearchInput defaultValue={query} />
        </header>
        {children}
      </main>
    </div>
  );
}

function EmptyPrompt() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-white/70">
      <p>
        Search across communities, posts, comments, events, and rewards. Try a
        topic, lyric, tour stop, or fan question — semantic search figures out
        what you mean even when the exact words don’t appear.
      </p>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-sm text-white/70">
      <p>
        No matches for <span className="text-white">“{query}”</span>. Try a
        different phrasing — semantic search works best with full thoughts
        rather than single keywords.
      </p>
    </div>
  );
}

function ResultsGrouped({ results }: { results: SearchResults }) {
  const sections: Array<{
    title: string;
    hits: SearchHit[];
    render: (h: SearchHit) => React.ReactNode;
  }> = [
    { title: "Artists", hits: results.groups.artists, render: renderArtist },
    { title: "Fans", hits: results.groups.fans, render: renderFan },
    {
      title: "Communities",
      hits: results.groups.communities,
      render: renderCommunity,
    },
    { title: "Posts", hits: results.groups.posts, render: renderPost },
    { title: "Comments", hits: results.groups.comments, render: renderComment },
    { title: "Events", hits: results.groups.events, render: renderEvent },
    { title: "Rewards", hits: results.groups.rewards, render: renderReward },
  ];

  return (
    <>
      <p className="text-xs text-white/50">
        {results.totalHits} {results.totalHits === 1 ? "result" : "results"}
        {" · "}
        {results.durationMs}ms
      </p>
      <div className="space-y-8">
        {sections.map((s) =>
          s.hits.length === 0 ? null : (
            <section key={s.title} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-white/70">
                {s.title}
              </h2>
              <ul className="space-y-2">
                {s.hits.map((h) => (
                  <li
                    key={`${h.source_table}:${h.source_id}`}
                    className="rounded-xl border border-white/10 bg-black/30 p-4 transition hover:border-white/30 hover:bg-black/50"
                  >
                    {s.render(h)}
                  </li>
                ))}
              </ul>
            </section>
          ),
        )}
      </div>
    </>
  );
}

function renderArtist(h: SearchHit) {
  if (h.data.kind !== "artist") return null;
  return (
    <Link href={`/artists/${h.data.slug}`} className="block">
      <p className="text-sm font-semibold text-white">{h.data.name}</p>
      {h.data.tagline && (
        <p className="mt-1 line-clamp-2 text-xs text-white/70">{h.data.tagline}</p>
      )}
    </Link>
  );
}

function renderFan(h: SearchHit) {
  if (h.data.kind !== "fan") return null;
  const display = h.data.first_name ?? h.data.profile_slug;
  return (
    <Link href={`/fans/${h.data.profile_slug}`} className="block">
      <p className="text-sm font-semibold text-white">{display}</p>
      <p className="mt-1 text-xs text-white/50">@{h.data.profile_slug}</p>
    </Link>
  );
}

function renderCommunity(h: SearchHit) {
  if (h.data.kind !== "community") return null;
  return (
    <Link href={`/artists/${h.data.slug}/community`} className="block">
      <p className="text-sm font-semibold text-white">
        {h.data.display_name}
      </p>
      {h.data.tagline ? (
        <p className="mt-1 line-clamp-2 text-xs text-white/70">
          {h.data.tagline}
        </p>
      ) : h.data.bio ? (
        <p className="mt-1 line-clamp-2 text-xs text-white/70">{h.data.bio}</p>
      ) : null}
    </Link>
  );
}

function renderPost(h: SearchHit) {
  if (h.data.kind !== "post") return null;
  return (
    <Link
      href={`/artists/${h.data.artist_slug}/community#post-${h.data.id}`}
      className="block"
    >
      {h.data.title ? (
        <p className="text-sm font-semibold text-white">{h.data.title}</p>
      ) : null}
      <p className="mt-1 line-clamp-3 text-xs text-white/70">{h.data.body}</p>
      <p className="mt-2 text-xs uppercase tracking-wide text-white/50">
        in {h.data.artist_slug} · {absoluteDate(h.data.created_at)}
      </p>
    </Link>
  );
}

function renderComment(h: SearchHit) {
  if (h.data.kind !== "comment") return null;
  return (
    <Link
      href={`/artists/${h.data.artist_slug}/community#comment-${h.data.id}`}
      className="block"
    >
      <p className="line-clamp-3 text-xs text-white/80">{h.data.body}</p>
      <p className="mt-2 text-xs uppercase tracking-wide text-white/50">
        comment in {h.data.artist_slug} · {absoluteDate(h.data.created_at)}
      </p>
    </Link>
  );
}

function renderEvent(h: SearchHit) {
  if (h.data.kind !== "event") return null;
  return (
    <Link href={`/artists/${h.data.artist_slug}`} className="block">
      <p className="text-sm font-semibold text-white">{h.data.title}</p>
      {h.data.detail ? (
        <p className="mt-1 line-clamp-2 text-xs text-white/70">{h.data.detail}</p>
      ) : null}
      <p className="mt-2 text-xs uppercase tracking-wide text-white/50">
        {h.data.artist_slug}
        {h.data.event_date ? ` · ${absoluteDate(h.data.event_date)}` : ""}
      </p>
    </Link>
  );
}

function renderReward(h: SearchHit) {
  if (h.data.kind !== "reward") return null;
  return (
    <Link href={`/rewards`} className="block">
      <p className="text-sm font-semibold text-white">{h.data.title}</p>
      {h.data.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-white/70">
          {h.data.description}
        </p>
      ) : null}
      <p className="mt-2 text-xs uppercase tracking-wide text-white/50">
        {h.data.point_cost.toLocaleString()} pts
      </p>
    </Link>
  );
}


