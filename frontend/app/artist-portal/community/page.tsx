import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function deletePost(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("community_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!adminRow) return;

  const postId = (formData.get("post_id") as string | null)?.trim();
  if (!postId) return;

  await supabase
    .from("community_posts")
    .delete()
    .eq("id", postId)
    .eq("artist_slug", adminRow.community_id);

  revalidatePath("/artist-portal/community");
}

async function createPost(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("community_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!adminRow) return;

  const body = (formData.get("body") as string | null)?.trim();
  const title = (formData.get("title") as string | null)?.trim() || null;
  if (!body) return;

  await supabase.from("community_posts").insert({
    artist_slug: adminRow.community_id,
    author_id: user.id,
    kind: "post",
    title,
    body,
  });

  revalidatePath("/artist-portal/community");
}

export default async function ArtistPortalCommunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/artist-portal/community");

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("community_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!adminRow) redirect("/artist-portal");

  const admin = createAdminClient();
  const { data: posts } = await admin
    .from("community_posts")
    .select(
      "id, title, body, created_at, author_id, fans(display_name)"
    )
    .eq("artist_slug", adminRow.community_id)
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

      {/* Compose form */}
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

      {/* Post list */}
      <div className="space-y-4">
        {recentPosts.length === 0 ? (
          <p className="text-sm text-white/50">
            No posts yet. Write one above.
          </p>
        ) : (
          recentPosts.map((p) => {
            const author = (p.fans as unknown) as { display_name: string | null } | null;
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
                    {author?.display_name ?? "Artist"} ·{" "}
                    {new Date(p.created_at as string).toLocaleString()}
                  </p>
                  <form action={deletePost}>
                    <input type="hidden" name="post_id" value={p.id as string} />
                    <button
                      type="submit"
                      className="text-xs text-white/30 hover:text-rose-300 transition-colors"
                      onClick={(e) => {
                        if (!confirm("Delete this post?")) e.preventDefault();
                      }}
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
