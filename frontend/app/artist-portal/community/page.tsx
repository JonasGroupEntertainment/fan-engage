import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { fanDisplayName, type FanNameParts } from "@/lib/format/fan-name";
import {
  assertPortalRole,
  requirePortalPage,
  roleAtLeast,
  PORTAL_MIN_ROLE,
} from "@/lib/artist-portal/access";

export const dynamic = "force-dynamic";

async function deletePost(formData: FormData) {
  "use server";
  // Editors and above may manage posts; throws on a lower role.
  const ctx = await assertPortalRole("communityPost");

  const postId = (formData.get("post_id") as string | null)?.trim();
  if (!postId) return;

  const admin = createAdminClient();
  await admin
    .from("community_posts")
    .delete()
    .eq("id", postId)
    .eq("artist_slug", ctx.communityId);

  revalidatePath("/artist-portal/community");
}

async function createPost(formData: FormData) {
  "use server";
  const ctx = await assertPortalRole("communityPost");

  const body = (formData.get("body") as string | null)?.trim();
  const title = (formData.get("title") as string | null)?.trim() || null;
  if (!body) return;

  const admin = createAdminClient();
  await admin.from("community_posts").insert({
    artist_slug: ctx.communityId,
    author_id: ctx.user.id,
    kind: "post",
    title,
    body,
  });

  revalidatePath("/artist-portal/community");
}

export default async function ArtistPortalCommunityPage() {
  // Viewers can read the feed; posting/deleting needs editor or above.
  const ctx = await requirePortalPage("community", "/artist-portal/community");
  const canPost = roleAtLeast(ctx.role, PORTAL_MIN_ROLE.communityPost);

  const admin = createAdminClient();
  const { data: posts } = await admin
    .from("community_posts")
    .select(
      // fans has first_name/last_name, not display_name (lib/format/fan-name).
      "id, title, body, created_at, author_id, fans(first_name, last_name)"
    )
    .eq("artist_slug", ctx.communityId)
    .order("created_at", { ascending: false })
    .limit(20);

  const recentPosts = posts ?? [];

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
          Recent posts and your artist announcements.
        </p>
      </div>

      {/* Compose form — editors and above */}
      {canPost && (
      <form
        action={createPost}
        className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-3"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-white/60">
          New Post
        </h2>
        <input
          name="title"
          type="text"
          placeholder="Title (optional)"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
        />
        <textarea
          name="body"
          required
          rows={4}
          placeholder="What's on your mind?"
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 resize-none"
        />

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-500 transition-colors"
          >
            Post
          </button>
        </div>
      </form>
      )}

      {/* Post list */}
      <div className="space-y-4">
        {recentPosts.length === 0 ? (
          <p className="text-sm text-white/50">
            No posts yet.{canPost ? " Write one above." : ""}
          </p>
        ) : (
          recentPosts.map((p) => {
            const author = (p.fans as unknown) as FanNameParts | null;
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
                    {new Date(p.created_at as string).toLocaleString()}
                  </p>
                  {canPost && (
                  <form action={deletePost}>
                    <input type="hidden" name="post_id" value={p.id as string} />
                    <button
                      type="submit"
                      className="text-xs text-white/30 hover:text-rose-300 transition-colors"
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
      </div>
    </div>
  );
}
