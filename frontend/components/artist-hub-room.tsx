import Link from "next/link";
import {
  getCommentsByPost,
  getPollData,
  getPostsByArtist,
} from "@/lib/data/community";
import { getCurrentFan } from "@/lib/data/fan";
import PostCard from "@/app/artists/[slug]/community/post-card";

/**
 * RaeLynn hub room: posts + at least one poll for signed-in fans.
 * Placeholder draft rows are seeded in 0053 and marked as such.
 */
export default async function ArtistHubRoom({
  artistSlug,
  artistName,
}: {
  artistSlug: string;
  artistName: string;
}) {
  const fan = await getCurrentFan();
  const isSignedIn = fan !== null;

  if (!isSignedIn) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <p className="text-xs uppercase tracking-[0.25em] text-white/55">Room</p>
        <h2 className="mt-2 text-xl font-semibold">Join to see the room</h2>
        <p className="mt-2 text-sm text-white/65">
          Posts and polls are for signed-in fans. Create a profile to enter
          the {artistName} room.
        </p>
        <Link
          href={`/signup?ref=${encodeURIComponent(artistSlug)}&next=${encodeURIComponent(`/artists/${artistSlug}`)}`}
          className="mt-4 inline-flex rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white"
        >
          Create fan profile
        </Link>
      </section>
    );
  }

  const posts = await getPostsByArtist(artistSlug, 8);
  const visible = posts.slice(0, 4);
  const [commentsByPost, pollByPost] = await Promise.all([
    Promise.all(visible.map((p) => getCommentsByPost(p.id))),
    Promise.all(
      visible.map((p) => (p.kind === "poll" ? getPollData(p.id) : Promise.resolve(null))),
    ),
  ]);

  const hasPoll = visible.some((p) => p.kind === "poll");

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/55">Room</p>
          <h2 className="mt-1 text-xl font-semibold">{artistName} community</h2>
          <p className="mt-1 text-sm text-white/60">
            Posts and polls. Draft placeholders are labeled until Kevin
            replaces them — not artist voice.
          </p>
        </div>
        <Link
          href={`/artists/${artistSlug}/community`}
          className="text-xs font-medium text-white/70 hover:text-white"
        >
          Open full room →
        </Link>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-white/65">
          The room is open. Be the first to post.
        </div>
      ) : (
        <div className="space-y-4">
          {visible.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              initialComments={commentsByPost[i]}
              isAuthor={post.author_id === fan.id}
              isAdmin={false}
              currentUserId={fan.id}
              poll={pollByPost[i]}
            />
          ))}
          {!hasPoll && (
            <p className="text-xs text-white/50">
              A draft poll is being seeded for this room.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
