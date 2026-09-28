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
import { canAccess, canUsePremiumFeature, getViewerEntitlement } from "@/lib/entitlements";
import { guestSignupHref } from "@/lib/guest-signup";
import {
  filterCommunityTagsForMarketplace,
  isMarketplaceLive,
  sanitizeCommunityTagFilter,
} from "@/lib/marketplace-live";
import PremiumPaywall from "@/components/premium-paywall";
import { PremiumLockNote } from "@/components/premium-cta";
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
  const marketplaceLive = isMarketplaceLive();
  const tagFilter = sanitizeCommunityTagFilter(
    (sp.tag ?? "").trim() || null,
    marketplaceLive,
  );

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
  const visibleTags = filterCommunityTagsForMarketplace(topTags, marketplaceLive);

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
  const guestSignup = guestSignupHref({
    ref: slug,
    next: `/artists/${slug}/community`,
  });
  const canWrite =
    isAdmin || canUsePremiumFeature("community_post", entitlement);

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
              Posts +5 pts · comments +10 pts · poll votes +10 pts · challenge
              entries +3 pts. Founding Fans #1–100 earn 1.5× points — not a
              paid subscription, and not just a badge.
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

      {isSignedIn && canWrite ? (
        <NewPostForm artistSlug={slug} isAdmin={isAdmin} />
      ) : isSignedIn ? (
        <PremiumLockNote
          communityId={slug}
          feature="Posting in this community"
        />
      ) : (
        <section className="rounded-3xl border border-aurora/40 bg-gradient-to-r from-aurora/20 via-slate-900 to-ember/20 p-5">
          <p className="text-sm">
            Create your fan profile and claim a Founding Fan badge for the{" "}
            {artist.name} community.
          </p>
          <div className="mt-3 flex gap-2">
            <Link
              href={guestSignup}
              className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-xs font-semibold text-white shadow-glass"
            >
              Create your fan profile
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

      <TagFilterChips tags={visibleTags} activeTag={tagFilter} />

      {posts.length === 0 ? (
        <section className="glass-card p-8 text-center">
          <p className="text-sm font-semibold">Nothing posted yet</p>
          <p className="mt-2 text-xs text-white/60">
            {isSignedIn
              ? canWrite
                ? "Be the first to post — earn 5 pts and kick off the conversation."
                : "Read along — posting is available with Premium."
              : "Create your fan profile to claim a Founding Fan badge and join the conversation."}
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
              if (!isSignedIn) {
                return (
                  <section
                    key={post.id}
                    className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm"
                  >
                    <p className="font-medium text-white">
                      Create your fan profile and claim a Founding Fan badge
                    </p>
                    <p className="mt-1 text-xs text-white/60">
                      {post.title
                        ? `"${post.title}" is waiting in the ${artist.name} community.`
                        : `Join the ${artist.name} community to read this.`}
                    </p>
                    <Link
                      href={guestSignup}
                      className="mt-3 inline-flex rounded-full bg-gradient-to-r from-aurora to-ember px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Create your fan profile
                    </Link>
                  </section>
                );
              }
              return (
                <PremiumPaywall
                  key={post.id}
                  feature="This post"
                  description={
                    post.title
                      ? `"${post.title}" — Premium fans see every backstage post and work-in-progress.`
                      : "Premium fans see every backstage post and work-in-progress."
                  }
                  communityId={slug}
                  accentFrom={artist.accentFrom}
                  accentTo={artist.accentTo}
                  reason={
                    access.reason === "needs-founder"
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
                canReply={canWrite}
                canReact={canWrite}
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
