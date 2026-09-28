"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import {
  generateArtistPostDraft,
  type DraftContext,
} from "@/lib/post-drafts";

async function requireAdminCommunity(): Promise<{
  communityId: string;
  userId: string;
}> {
  // Act on the community the admin currently has selected, and only when
  // they hold at least the "editor" role there (or are a super-admin).
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");
  const communityId = ctx.currentCommunityId ?? "";
  if (!communityId) redirect("/admin");
  const guard = await authorizeAdmin({ communityId, minRole: "editor" }, ctx);
  if (!guard.ok) throw new Error("Forbidden");
  return { communityId, userId: ctx.user.id };
}

export async function generateAction() {
  const { communityId } = await requireAdminCommunity();
  const admin = createAdminClient();

  // Pull real context. Wrap the artist_events query in a try/catch in case
  // the column name differs across deploys.
  const today = new Date().toISOString().slice(0, 10);
  const [eventsRes, postsRes, commentsRes, artistRes] = await Promise.all([
    admin
      .from("artist_events")
      .select("title, event_date, detail")
      .eq("artist_slug", communityId)
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(5),
    admin
      .from("community_posts")
      .select("kind, title, body")
      .eq("artist_slug", communityId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("community_comments")
      .select("body, post_id, community_posts!inner(artist_slug)")
      .eq("community_posts.artist_slug", communityId)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("artists")
      .select("name")
      .eq("slug", communityId)
      .maybeSingle(),
  ]);

  const upcoming_events = (eventsRes.data ?? []).map((e) => ({
    title: (e.title as string) ?? "Untitled event",
    event_date: (e.event_date as string | null) ?? null,
    detail: (e.detail as string | null) ?? null,
  }));

  const recent_admin_posts = (postsRes.data ?? []).map((p) => ({
    kind: (p.kind as string) ?? "post",
    title: (p.title as string | null) ?? null,
    body: (p.body as string) ?? "",
  }));

  const recent_fan_comments_sample = (commentsRes.data ?? [])
    .map((c) => ({ body: (c.body as string) ?? "" }))
    .filter((c) => c.body.trim().length > 0)
    .slice(0, 12);

  const artistName =
    (artistRes.data as { name?: string | null } | null)?.name ?? null;

  const context: DraftContext = {
    artist_slug: communityId,
    artist_name: artistName,
    upcoming_events,
    recent_admin_posts,
    recent_fan_comments_sample,
  };

  let draft;
  try {
    draft = await generateArtistPostDraft(context);
  } catch (e) {
    console.warn("[post-drafts] generation failed:", e);
    return;
  }
  if (!draft) return;

  await admin.from("artist_post_drafts").insert({
    artist_slug: communityId,
    kind: draft.kind,
    suggested_title: draft.title,
    suggested_body: draft.body,
    context_summary: draft.context_summary,
    inputs_json: context,
    generated_by: "ai",
  });

  revalidatePath("/admin/post-drafts");
}

export async function publishAction(formData: FormData) {
  const { communityId, userId } = await requireAdminCommunity();
  const draftId = String(formData.get("draft_id") ?? "");
  if (!draftId) return;

  const editedTitle = String(formData.get("edited_title") ?? "").trim();
  const editedBody = String(formData.get("edited_body") ?? "").trim();

  const admin = createAdminClient();

  const { data: draft } = await admin
    .from("artist_post_drafts")
    .select("kind, suggested_title, suggested_body, artist_slug, status")
    .eq("id", draftId)
    .eq("artist_slug", communityId)
    .maybeSingle();
  if (!draft || draft.status !== "pending") return;

  const finalTitle = editedTitle || (draft.suggested_title as string | null) || null;
  const finalBody = editedBody || (draft.suggested_body as string);
  if (!finalBody.trim()) return;

  const { data: post } = await admin
    .from("community_posts")
    .insert({
      artist_slug: communityId,
      author_id: userId,
      kind: draft.kind,
      title: finalTitle,
      body: finalBody,
      visibility: "public",
    })
    .select("id")
    .single();
  if (!post) return;

  await admin
    .from("artist_post_drafts")
    .update({
      status: "published",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      published_post_id: post.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId);

  revalidatePath("/admin/post-drafts");
  revalidatePath(`/artists/${communityId}/community`);
}

export async function discardAction(formData: FormData) {
  const { communityId, userId } = await requireAdminCommunity();
  const draftId = String(formData.get("draft_id") ?? "");
  if (!draftId) return;

  const admin = createAdminClient();
  await admin
    .from("artist_post_drafts")
    .update({
      status: "discarded",
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("artist_slug", communityId);

  revalidatePath("/admin/post-drafts");
}
