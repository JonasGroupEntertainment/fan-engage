import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  adminDeleteCommentAction,
  adminDeleteEntryAction,
  adminDeletePostAction,
  adminTogglePinAction,
} from "./actions";
import ModerationButton from "./moderation-button";

export const dynamic = "force-dynamic";

type PostRow = {
  id: string;
  artist_slug: string;
  kind: string;
  title: string | null;
  body: string;
  pinned: boolean;
  created_at: string;
  author_id: string;
  author_first_name: string | null;
};

type CommentRow = {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  author_id: string;
  author_first_name: string | null;
};

type EntryRow = {
  id: string;
  post_id: string;
  body: string | null;
  image_url: string | null;
  created_at: string;
  fan_id: string;
  fan_first_name: string | null;
};

async function loadFeed() {
  const admin = createAdminClient();
  const [postsRes, commentsRes, entriesRes, fansRes] = await Promise.all([
    admin
      .from("community_posts")
      .select("id,artist_slug,kind,title,body,pinned,created_at,author_id")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("community_comments")
      .select("id,post_id,body,created_at,author_id")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("community_challenge_entries")
      .select("id,post_id,body,image_url, image_alt,created_at,fan_id")
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("fans").select("id,first_name"),
  ]);

  const nameById = new Map<string, string | null>(
    (fansRes.data ?? []).map((f) => [f.id as string, (f.first_name as string | null) ?? null]),
  );

  const posts: PostRow[] = (postsRes.data ?? []).map((p) => ({
    ...(p as Omit<PostRow, "author_first_name">),
    author_first_name: nameById.get(p.author_id as string) ?? null,
  }));
  const comments: CommentRow[] = (commentsRes.data ?? []).map((c) => ({
    ...(c as Omit<CommentRow, "author_first_name">),
    author_first_name: nameById.get(c.author_id as string) ?? null,
  }));
  const entries: EntryRow[] = (entriesRes.data ?? []).map((e) => ({
    ...(e as Omit<EntryRow, "fan_first_name">),
    fan_first_name: nameById.get(e.fan_id as string) ?? null,
  }));
  return { posts, comments, entries };
}

function timeAgo(iso: string): string {
  const sec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function KindChip({ kind }: { kind: string }) {
  const tone =
    kind === "announcement"
      ? "bg-sky-500/20 text-sky-200"
      : kind === "poll"
        ? "bg-fuchsia-500/20 text-fuchsia-200"
        : kind === "challenge"
          ? "bg-amber-500/20 text-amber-200"
          : "bg-white/10 text-white/70";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs uppercase tracking-wide ${tone}`}>
      {kind}
    </span>
  );
}

export default async function AdminCommunityPage() {
  const { posts, comments, entries } = await loadFeed();

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Community moderation
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Cross-artist feed — pin, delete, and jump to the fan who authored a post.
        </p>
        <Link
          href="/admin/community/seed"
          className="mt-3 inline-flex rounded-full border border-white/20 px-4 py-1.5 text-xs text-white/70 hover:bg-white/10"
        >
          Seed starter content →
        </Link>
      </div>

      {/* Posts */}
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <header className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Posts · {posts.length}</p>
        </header>
        <div className="divide-y divide-white/5">
          {posts.length === 0 && (
            <p className="py-6 text-center text-xs text-white/50">No posts yet.</p>
          )}
          {posts.map((p) => (
            <div key={p.id} className="flex items-start gap-3 py-3">
              <div className="w-20 shrink-0 text-xs text-white/50">
                {timeAgo(p.created_at)}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <KindChip kind={p.kind} />
                  <Link
                    href={`/artists/${p.artist_slug}/community`}
                    className="rounded-full bg-white/5 px-2 py-0.5 text-white/70 hover:bg-white/10"
                  >
                    /{p.artist_slug}
                  </Link>
                  {p.pinned && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-amber-200">
                      Pinned
                    </span>
                  )}
                  <Link
                    href={`/admin/fans/${p.author_id}`}
                    className="text-white/70 hover:text-white"
                  >
                    {p.author_first_name ?? "Anonymous"}
                  </Link>
                </div>
                {p.title && <p className="text-sm font-semibold">{p.title}</p>}
                <p className="line-clamp-3 text-sm text-white/80">{p.body}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <ModerationButton
                  action={adminTogglePinAction}
                  fields={{
                    post_id: p.id,
                    currently_pinned: String(p.pinned),
                  }}
                  label={p.pinned ? "Unpin" : "Pin"}
                />
                <ModerationButton
                  action={adminDeletePostAction}
                  fields={{ post_id: p.id }}
                  label="Delete"
                  variant="delete"
                  confirmMessage="Delete this post? This cannot be undone."
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Comments */}
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <header className="mb-3">
          <p className="text-sm font-semibold">Recent comments · {comments.length}</p>
        </header>
        <div className="divide-y divide-white/5">
          {comments.length === 0 && (
            <p className="py-6 text-center text-xs text-white/50">No comments yet.</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-3 py-3">
              <div className="w-20 shrink-0 text-xs text-white/50">
                {timeAgo(c.created_at)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <Link
                    href={`/admin/fans/${c.author_id}`}
                    className="font-semibold text-white/70 hover:text-white"
                  >
                    {c.author_first_name ?? "Anonymous"}
                  </Link>
                  <span className="text-white/50"> on post {c.post_id.slice(0, 8)}…</span>
                </p>
                <p className="mt-1 line-clamp-2 text-sm text-white/80">{c.body}</p>
              </div>
              <ModerationButton
                action={adminDeleteCommentAction}
                fields={{ comment_id: c.id }}
                label="Delete"
                variant="delete"
                confirmMessage="Delete this comment? This cannot be undone."
              />
            </div>
          ))}
        </div>
      </section>

      {/* Challenge entries */}
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <header className="mb-3">
          <p className="text-sm font-semibold">Challenge entries · {entries.length}</p>
        </header>
        <div className="divide-y divide-white/5">
          {entries.length === 0 && (
            <p className="py-6 text-center text-xs text-white/50">No entries yet.</p>
          )}
          {entries.map((e) => (
            <div key={e.id} className="flex items-start gap-3 py-3">
              <div className="w-20 shrink-0 text-xs text-white/50">
                {timeAgo(e.created_at)}
              </div>
              {e.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={e.image_url}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-xl object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <Link
                    href={`/admin/fans/${e.fan_id}`}
                    className="font-semibold text-white/70 hover:text-white"
                  >
                    {e.fan_first_name ?? "Anonymous"}
                  </Link>
                  <span className="text-white/50">
                    {" "}entry on challenge {e.post_id.slice(0, 8)}…
                  </span>
                </p>
                {e.body && <p className="mt-1 line-clamp-2 text-sm text-white/80">{e.body}</p>}
              </div>
              <ModerationButton
                action={adminDeleteEntryAction}
                fields={{ entry_id: e.id }}
                label="Delete"
                variant="delete"
                confirmMessage="Delete this challenge entry? This cannot be undone."
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
