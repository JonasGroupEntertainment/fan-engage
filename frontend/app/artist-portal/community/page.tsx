import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { fanDisplayName, type FanNameParts } from "@/lib/format/fan-name";
import {
  requirePortalPage,
  roleAtLeast,
  PORTAL_MIN_ROLE,
} from "@/lib/artist-portal/access";
import { getAdminContext } from "@/lib/admin";
import {
  isMissingScheduledColumnError,
  partitionScheduledPosts,
} from "@/lib/data/scheduled-posts";
import PortalComposer, { type PortalDraft } from "./composer";
import {
  deletePortalPostAction,
  publishScheduledPostNowAction,
  unschedulePostAction,
} from "./actions";

export const dynamic = "force-dynamic";

const POST_SELECT =
  // fans has first_name/last_name, not display_name (lib/format/fan-name).
  "id, kind, title, body, created_at, author_id, visibility, scheduled_for, announced_at, fans:fans!community_posts_author_id_fkey(first_name, last_name)";
const POST_SELECT_PRE_0094 =
  "id, kind, title, body, created_at, author_id, visibility, fans:fans!community_posts_author_id_fkey(first_name, last_name)";

interface PortalPostRow {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  created_at: string;
  author_id: string;
  visibility: string | null;
  scheduled_for: string | null;
  announced_at?: string | null;
  fans: unknown;
}

export default async function ArtistPortalCommunityPage() {
  // Viewers can read the feed; posting/deleting needs editor or above.
  const ctx = await requirePortalPage("community", "/artist-portal/community");
  const canPost = roleAtLeast(ctx.role, PORTAL_MIN_ROLE.communityPost);

  const admin = createAdminClient();
  const postsQuery = (select: string) =>
    admin
      .from("community_posts")
      .select(select)
      .eq("artist_slug", ctx.communityId)
      .order("created_at", { ascending: false })
      .limit(40);

  let postsRes = await postsQuery(POST_SELECT);
  // Until 0094 is applied the scheduled columns do not exist.
  if (postsRes.error && isMissingScheduledColumnError(postsRes.error)) {
    postsRes = await postsQuery(POST_SELECT_PRE_0094);
  }
  const rows = ((postsRes.data ?? []) as unknown as Array<Partial<PortalPostRow>>).map((p) => ({
    ...p,
    scheduled_for: p.scheduled_for ?? null,
  })) as PortalPostRow[];
  const { live, scheduled } = partitionScheduledPosts(rows);
  const recentPosts = live.slice(0, 20);

  // "Drafts for you" — editor+ only (the same people who can act on them).
  let drafts: PortalDraft[] = [];
  let showAdminDraftsLink = false;
  if (canPost) {
    const [{ data: draftRows }, adminCtx] = await Promise.all([
      admin
        .from("artist_post_drafts")
        .select("id, kind, suggested_title, suggested_body, context_summary, created_at")
        .eq("artist_slug", ctx.communityId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
      getAdminContext().catch(() => null),
    ]);
    drafts = (draftRows ?? []) as PortalDraft[];
    showAdminDraftsLink = adminCtx?.isSuperAdmin === true;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Community
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Post as the artist, schedule ahead, and keep the feed moving.{" "}
          <Link href={`/artists/${ctx.communityId}/community`} className="underline hover:text-white">
            See the fan view
          </Link>
          .
        </p>
      </div>

      {/* Composer + AI drafts — editors and above */}
      {canPost && (
        <PortalComposer
          artistSlug={ctx.communityId}
          drafts={drafts}
          showAdminDraftsLink={showAdminDraftsLink}
        />
      )}

      {/* Scheduled posts — visible only to the team until they go live */}
      {scheduled.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
            Scheduled ({scheduled.length})
          </h2>
          {scheduled.map((p) => {
            const author = p.fans as FanNameParts | null;
            return (
              <div
                key={p.id}
                className="rounded-2xl border border-dashed border-purple-400/30 bg-purple-500/5 p-5"
              >
                <p className="text-xs font-semibold text-purple-200/80">
                  Goes live {new Date(p.scheduled_for as string).toLocaleString()}
                  {p.visibility && p.visibility !== "public" ? ` · ${p.visibility}` : ""}
                  {p.kind !== "post" ? ` · ${p.kind}` : ""}
                </p>
                {p.title && (
                  <p className="mt-1 text-base font-semibold text-white">{p.title}</p>
                )}
                <p className="mt-1 text-sm text-white/80 whitespace-pre-line">{p.body}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-white/50">{fanDisplayName(author, "Artist")}</p>
                  {canPost && (
                    <div className="flex items-center gap-3">
                      <form action={publishScheduledPostNowAction}>
                        <input type="hidden" name="post_id" value={p.id} />
                        <button
                          type="submit"
                          className="min-h-11 px-2 text-xs font-semibold text-purple-200 hover:text-white transition-colors"
                        >
                          Publish now
                        </button>
                      </form>
                      <form action={unschedulePostAction}>
                        <input type="hidden" name="post_id" value={p.id} />
                        <button
                          type="submit"
                          className="min-h-11 px-2 text-xs text-white/40 hover:text-rose-300 transition-colors"
                          title="Removes the scheduled post. It was never shown to fans."
                        >
                          Unschedule
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Post list */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">Recent</h2>
        {recentPosts.length === 0 ? (
          <p className="text-sm text-white/50">
            No posts yet.{canPost ? " Write one above." : ""}
          </p>
        ) : (
          recentPosts.map((p) => {
            const author = p.fans as FanNameParts | null;
            return (
              <div
                key={p.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-5"
              >
                {p.title && (
                  <p className="text-base font-semibold text-white mb-1">
                    {p.title}
                  </p>
                )}
                <p className="text-sm text-white/80 whitespace-pre-line">
                  {p.body}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-white/50">
                    {fanDisplayName(author, "Artist")} ·{" "}
                    {new Date(p.created_at).toLocaleString()}
                    {p.kind !== "post" ? ` · ${p.kind}` : ""}
                    {p.visibility && p.visibility !== "public" ? ` · ${p.visibility}` : ""}
                  </p>
                  {canPost && (
                    <form action={deletePortalPostAction}>
                      <input type="hidden" name="post_id" value={p.id} />
                      <button
                        type="submit"
                        className="min-h-11 px-2 text-xs text-white/30 hover:text-rose-300 transition-colors"
                        title="Delete this post"
                      >
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
