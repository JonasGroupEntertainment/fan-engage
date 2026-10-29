import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { listArtists } from "@/lib/artists";
import { getArtistFromDb } from "@/lib/data/artists";
import { getAdminUser } from "@/lib/admin";
import { getCurrentFan } from "@/lib/data/fan";
import { getActiveFanActionsForArtist } from "@/lib/data/campaigns";
import { getLivePresavesForArtist } from "@/lib/presave/read";
import { getLockedPostStubs, mergeFounderStubs } from "./founder-gate";
import {
  getChallengeEntries,
  getCommentsByPost,
  getPollData,
  getPostsByArtist,
  getTeamAuthoredPostIds,
  getTopTagsForArtist,
} from "@/lib/data/community";
import { canAccess, canUsePremiumFeature, getViewerEntitlement } from "@/lib/entitlements";
import { canReadPost } from "@/lib/founder-gate/core";
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
import FounderLockedCard from "./founder-locked-card";
import PickedForYou from "@/components/personal/picked-for-you";
import PointsToastHost from "@/components/points-toast";

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

  const [fan, visiblePosts, lockedStubs, adminUser, fanActions, presaves, entitlement, topTags] =
    await Promise.all([
      getCurrentFan(),
      getPostsByArtist(slug, 30, { tagFilter }),
      getLockedPostStubs(slug, { excludeIds: [], tagFilter }),
      getAdminUser(),
      getActiveFanActionsForArtist(slug),
      getLivePresavesForArtist(slug),
      getViewerEntitlement(slug),
      getTopTagsForArtist(slug, 10),
    ]);

  // 0096 hides premium and founder-only rows from fans who do not qualify,
  // so the feed would silently lose them. Stubs are id/title only (the RPC
  // cannot return a body) and merge back in as locked cards. Fans who can
  // already read the row have it in visiblePosts; the stub list excludes
  // those ids.
  const viewer = {
    isAdmin: adminUser !== null,
    isFounder: Boolean(entitlement?.isFounder),
    isPremium: Boolean(entitlement?.isPremium),
    fanId: fan?.id ?? null,
  };
  const seen = new Set(visiblePosts.map((p) => p.id));
  const posts = mergeFounderStubs(
    visiblePosts,
    lockedStubs.filter((stub) => !seen.has(stub.id)),
  );
  const readable = (post: (typeof posts)[number]) => {
    if (viewer.isAdmin) return true;
    if (viewer.fanId && post.author_id && post.author_id === viewer.fanId) return true;
    return canReadPost(post, viewer) && canAccess(post.visibility, entitlement).allowed;
  };
  const visibleTags = filterCommunityTagsForMarketplace(topTags, marketplaceLive);

  // Parallel-fetch comments + poll data + challenge entries for every visible
  // post so the feed renders in one round-trip. Fine at MVP scale; when post
  // counts per page get big we'll switch to on-expand fetching.
  const [commentsByPost, pollByPost, entriesByPost, teamPostIds] = await Promise.all([
    Promise.all(posts.map((p) => (readable(p) ? getCommentsByPost(p.id) : Promise.resolve([])))),
    Promise.all(
      posts.map((p) =>
        readable(p) && p.kind === "poll" ? getPollData(p.id) : Promise.resolve(null),
      ),
    ),
    Promise.all(
      posts.map((p) =>
        readable(p) && p.kind === "challenge" ? getChallengeEntries(p.id) : Promise.resolve([]),
      ),
    ),
    // One batched admin_users lookup for the artist/team byline.
    getTeamAuthoredPostIds(slug, posts),
  ]);

  const isSignedIn = fan !== null;
  const isAdmin = adminUser !== null;
  const guestSignup = guestSignupHref({
    ref: slug,
    next: `/artists/${slug}/community`,
  });
  // Premium gates the top-level composer only. Replies, reactions, votes and
  // challenge entries are Free for every signed-in fan; their daily point
  // caps live in the SQL award triggers.
  const canWrite =
    isAdmin || canUsePremiumFeature("community_post", entitlement);
  const canEngage = isSignedIn;

  const heroGradient = `linear-gradient(to bottom right, ${artist.accentFrom}40, #0f172a, #000000)`;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      {/* "+10 pts · 1,569 to Gold" after reactions, replies, votes, entries, posts. */}
      <PointsToastHost />

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
            {/* Amounts and caps mirror the SQL award triggers — see
                COMMUNITY_EARN_RULES in lib/entitlements-core.ts (tested). */}
            <p className="mt-3 text-sm text-white/75">
              Free for every fan: comments +10 pts (up to 5/day) · poll &amp;
              prediction votes +10 pts (up to 3/day) · challenge entries +3 pts
              · reactions. Starting a post (+5 pts) is Premium.{" "}
              Founding Fans #1–100 earn 1.5× points — not a paid subscription,
              and not just a badge.
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

      <FanCtaBlock
        artistSlug={slug}
        actions={fanActions}
        presaves={presaves}
        signedIn={isSignedIn}
        signInHref={`/login?next=/artists/${slug}/community`}
        accentFrom={artist.accentFrom}
        accentTo={artist.accentTo}
      />

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
                : "Nothing to reply to yet. Starting a post is available with Premium; replies, reactions and votes are free for every fan."
              : "Create your fan profile to claim a Founding Fan badge and join the conversation."}
          </p>
        </section>
      ) : (
        <div className="space-y-4">
          {posts.map((post, i) => {
            // Admins, staff, and the author always see the post. Everyone
            // else is gated on tier. getPostsByArtist already cleared the
            // body, media, and thread summary when this is false.
            const access = readable(post)
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
              if (post.visibility === "founder-only") {
                return (
                  <FounderLockedCard
                    key={post.id}
                    title={post.title}
                    artistName={artist.name}
                    foundersHref={`/artists/${slug}/founders`}
                    accentFrom={artist.accentFrom}
                    accentTo={artist.accentTo}
                  />
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
                canReply={canEngage}
                canReact={canEngage}
                teamByline={teamPostIds.has(post.id) ? artist.name : null}
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
