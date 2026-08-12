import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listArtists } from "@/lib/artists";
import { getArtistFromDb } from "@/lib/data/artists";
import { getAdminUser } from "@/lib/admin";
import { getCurrentFan } from "@/lib/data/fan";
import { getActiveFanActionsForArtist } from "@/lib/data/campaigns";
import {
  getChallengeEntries,
  getCommentsByPost,
  getPollData,
  getPostsByArtist,
  getTopTagsForArtist,
} from "@/lib/data/community";
import { canAccess, getViewerEntitlement } from "@/lib/entitlements";
import PremiumPaywall from "@/components/premium-paywall";
import FanCtaBlock from "./fan-cta-block";
import NewPostForm from "./new-post-form";
import PostCard from "./post-card";
import TagFilterChips from "./tag-filter-chips";
import PickedForYou from "@/components/personal/picked-for-you";

export async function generateStaticParams() {
  return listArtists().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getArtistFromDb(slug);
  if (!artist) return { title: "Community" };
  return { title: `${artist.name} Community` };
}

export default async function ArtistCommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tag?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const tagFilter = (sp.tag ?? "").trim() || null;

  const artist = await getArtistFromDb(slug);
  if (!artist) notFound();

  const [fan, posts, adminUser, fanActions, entitlement, topTags] = await Promise.all([
    getCurrentFan(),
    getPostsByArtist(slug, 30, { tagFilter }),
    getAdminUser(),
    getActiveFanActionsForArtist(slug),
    getViewerEntitlement(slug),
    getTopTagsForArtist(slug, 10),
  ]);

  // Parallel-fetch comments + poll data + challenge entries for every visible
  // post so the feed renders in one round-trip. Fine at MVP scale; when post
  // counts per page get big we'll switch to on-expand fetching.
  const [commentsByPost, pollByPost, entriesByPost] = await Promise.all([
    Promise.all(posts.map((p) => getCommentsByPost(p.id))),
    Promise.all(
      posts.map((p) => (p.kind === "poll" ? getPollData(p.id) : Promise.resolve(null))),
    ),
    Promise.all(
      posts.map((p) =>
        p.kind === "challenge" ? getChallengeEntries(p.id) : Promise.resolve([]),
      ),
    ),
  ]);

  const isSignedIn = fan !== null;
  const isAdmin = adminUser !== null;

  const heroGradient = `linear-gradient(to bottom right, ${artist.accentFrom}40, #0f172a, #000000)`;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">

      {fan?.id && (
        <PickedForYou fanId={fan.id} artistSlug={slug} />
      )}
      <section
        className="rounded-3xl border border-white/10 p-8"
        style={{ backgroundImage: heroGradient }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/60">Community</p>
            <h1
              className="mt-2 text-3xl font-semibold"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {artist.name} community
            </h1>
            <p className="mt-3 text-sm text-white/75">
              Posts +5 pts · comments +2 pts · poll votes +1 pt · challenge
              entries +3 pts.
            </p>
          </div>
          <Link
            href={`/artists/${slug}`}
            className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/70 hover:bg-white/10"
          >
            ← Artist page
          </Link>
        </div>
      </section>

      <FanCtaBlock artistSlug={slug} actions={fanActions} signedIn={isSignedIn} />

      {isSignedIn ? (
        <NewPostForm artistSlug={slug} isAdmin={isAdmin} />
      ) : (
        <section className="rounded-3xl border border-aurora/40 bg-gradient-to-r from-aurora/20 via-slate-900 to-ember/20 p-5">
          <p className="text-sm">
            Sign in to post in the {artist.name} community.
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href={`/signup?ref=${encodeURIComponent(slug)}&next=${encodeURIComponent(`/artists/${slug}/community`)}`}
              className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-xs font-semibold text-white shadow-glass"
            >
              Create account
            </Link>
            <Link
              href={`/login?next=/artists/${slug}/community`}
              className="rounded-full border border-white/20 px-4 py-2 text-xs text-white/80 hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </section>
      )}

      <TagFilterChips tags={topTags} activeTag={tagFilter} />

      {posts.length === 0 ? (
        <section className="glass-card p-8 text-center">
          <p className="text-sm font-semibold">Nothing posted yet</p>
          <p className="mt-2 text-xs text-white/60">
            {isSignedIn
              ? "Be the first to post — earn 5 pts and kick off the conversation."
              : "Be the first in when the community fills up — sign in to post."}
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {posts.map((post, i) => {
            // Admins always see everything — otherwise gate premium posts.
            const access = isAdmin
              ? { allowed: true, reason: "premium-member" as const }
              : canAccess(post.visibility, entitlement);
            if (!access.allowed) {
              return (
                <PremiumPaywall
                  key={post.id}
                  feature="This post"
                  description={
                    post.title
                      ? `"${post.title}" — Premium fans see every backstage post, voice note, and work-in-progress.`
                      : "Premium fans see every backstage post, voice note, and work-in-progress."
                  }
                  communityId={slug}
                  accentFrom={artist.accentFrom}
                  accentTo={artist.accentTo}
                  reason={
                    access.reason === "signed-out"
                      ? "signed-out"
                      : access.reason === "needs-founder"
                        ? "needs-founder"
                        : "needs-premium"
                  }
                  compact
                />
              );
            }
            return (
              <PostCard
                key={post.id}
                post={post}
                initialComments={commentsByPost[i]}
                isAuthor={fan !== null && post.author_id === fan.id}
                isAdmin={isAdmin}
                currentUserId={fan?.id ?? null}
                poll={pollByPost[i]}
                challengeEntries={entriesByPost[i]}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}
