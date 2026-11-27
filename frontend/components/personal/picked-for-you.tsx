/**
 * <PickedForYou /> — server component that fetches 3 personalized
 * posts and renders them as a horizontal scroll on mobile / row on
 * desktop.
 *
 * Renders nothing if no eligible posts (silent degrade — better than
 * an empty tile saying "Sorry, no recs").
 */

import Link from "next/link";
import { getPickedForYou, type PickedPost } from "@/lib/personal-feed/compute";
import { postCommunityHref } from "@/lib/community/post-anchor";

interface Props {
  fanId: string;
  artistSlug: string;
  limit?: number;
}

export default async function PickedForYou({
  fanId,
  artistSlug,
  limit = 3,
}: Props) {
  const posts = await getPickedForYou({ fanId, artistSlug, limit });
  if (posts.length === 0) return null;

  // Show the "personalized" badge only if at least one card was picked
  // by tag match (otherwise it's just "recent posts you missed").
  const hasTagMatch = posts.some((p) => p.reason === "tag-match");
  const headerLabel = hasTagMatch ? "Picked for you" : "You might have missed";

  return (
    <section
      aria-label={headerLabel}
      className="space-y-3 rounded-2xl border border-aurora/20 bg-gradient-to-br from-aurora/10 via-black/30 to-ember/5 p-4"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base">✨</span>
        <h2 className="text-sm font-semibold text-white">{headerLabel}</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {posts.map((p) => (
          <PickedCard key={p.id} post={p} artistSlug={artistSlug} />
        ))}
      </div>
    </section>
  );
}

function PickedCard({ post, artistSlug }: { post: PickedPost; artistSlug: string }) {
  const preview = previewText(post);
  return (
    <Link
      href={postCommunityHref(artistSlug, post.id)}
      className="block rounded-xl border border-white/10 bg-black/40 p-3 transition hover:border-white/30 hover:bg-black/60"
    >
      {post.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.image_url}
          alt={post.image_alt ?? ""}
          className="mb-2 aspect-video w-full rounded-lg object-cover"
          loading="lazy"
        />
      )}
      {post.title && (
        <p className="line-clamp-1 text-xs font-semibold text-white">
          {post.title}
        </p>
      )}
      <p className="line-clamp-3 text-xs text-white/70">{preview}</p>
      {post.tags && post.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {post.tags.slice(0, 2).map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-wide text-white/60"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

function previewText(p: PickedPost): string {
  const body = p.body ?? "";
  if (body.length <= 140) return body;
  return body.slice(0, 137).trimEnd() + "…";
}
