import Link from "next/link";
import {
  getCommentsByPost,
  getPollData,
  getPostsByArtist,
  getTeamAuthoredPostIds,
} from "@/lib/data/community";
import { getCurrentFan } from "@/lib/data/fan";
import { getAdminUser } from "@/lib/admin";
import { canReadPost } from "@/lib/founder-gate/core";
import { canUsePremiumFeature, getViewerEntitlement } from "@/lib/entitlements";
import PostCard from "@/app/artists/[slug]/community/post-card";
import FounderLockedCard from "@/app/artists/[slug]/community/founder-locked-card";
import { getLockedPostStubs, mergeFounderStubs } from "@/app/artists/[slug]/community/founder-gate";
import PremiumPaywall from "@/components/premium-paywall";

/**
 * Artist hub room: posts + polls for signed-in fans.
 * Draft/placeholder seed rows are filtered in getPostsByArtist.
 */
export default async function ArtistHubRoom({
  artistSlug,
  artistName,
}: {
  artistSlug: string;
  artistName: string;
}) {
  const [fan, entitlement, adminUser] = await Promise.all([
    getCurrentFan(),
    getViewerEntitlement(artistSlug),
    getAdminUser(),
  ]);
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

  const viewer = {
    isAdmin: adminUser !== null,
    isFounder: Boolean(entitlement?.isFounder),
    isPremium: Boolean(entitlement?.isPremium),
    fanId: fan.id,
  };
  const [loaded, stubs] = await Promise.all([
    getPostsByArtist(artistSlug, 8),
    getLockedPostStubs(artistSlug, { excludeIds: [], limit: 8 }),
  ]);
  const seen = new Set(loaded.map((p) => p.id));
  const visible = mergeFounderStubs(
    loaded,
    stubs.filter((stub) => !seen.has(stub.id)),
  ).slice(0, 4);
  const canRead = (post: (typeof visible)[number]) => canReadPost(post, viewer);
  const [commentsByPost, pollByPost, teamPostIds] = await Promise.all([
    Promise.all(visible.map((p) => (canRead(p) ? getCommentsByPost(p.id) : Promise.resolve([])))),
    Promise.all(
      visible.map((p) =>
        canRead(p) && p.kind === "poll" ? getPollData(p.id) : Promise.resolve(null),
      ),
    ),
    getTeamAuthoredPostIds(artistSlug, visible),
  ]);

  const hasPoll = visible.some((p) => p.kind === "poll");
  const canWrite = canUsePremiumFeature("community_post", entitlement);

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-white/55">Room</p>
          <h2 className="mt-1 text-xl font-semibold">{artistName} community</h2>
          <p className="mt-1 text-sm text-white/60">
            Posts and polls from the {artistName} room.
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
          {visible.map((post, i) =>
            canRead(post) ? (
              <PostCard
                key={post.id}
                post={post}
                initialComments={commentsByPost[i]}
                isAuthor={post.author_id === fan.id}
                isAdmin={viewer.isAdmin}
                currentUserId={fan.id}
                canReply={canWrite}
                canReact={canWrite}
                teamByline={teamPostIds.has(post.id) ? artistName : null}
                poll={pollByPost[i]}
              />
            ) : post.visibility === "founder-only" ? (
              <FounderLockedCard
                key={post.id}
                title={post.title}
                artistName={artistName}
                foundersHref={`/artists/${artistSlug}/founders`}
              />
            ) : (
              <PremiumPaywall
                key={post.id}
                feature="This post"
                description={
                  post.title
                    ? `"${post.title}" — Premium fans see every backstage post and work-in-progress.`
                    : "Premium fans see every backstage post and work-in-progress."
                }
                communityId={artistSlug}
                reason="needs-premium"
                compact
              />
            ),
          )}
          {!hasPoll && (
            <p className="text-xs text-white/50">
              Polls show up here when the room has one.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
