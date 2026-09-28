"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin-guard";
import { communityOfRow, type CommunityRowTable } from "@/lib/community-owner";

/**
 * Content moderation (delete, pin) needs editor or above in the community
 * that owns the row. Returns false when the row does not exist.
 */
async function requireRowEditor(table: CommunityRowTable, id: string): Promise<boolean> {
  const communityId = await communityOfRow(table, id);
  if (!communityId) return false;
  await assertAdmin({ communityId, minRole: "editor" });
  return true;
}

export async function adminDeletePostAction(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  if (!postId) return;
  if (!(await requireRowEditor("community_posts", postId))) return;
  const admin = createAdminClient();
  await admin.from("community_posts").delete().eq("id", postId);
  revalidatePath("/admin/community");
}

export async function adminTogglePinAction(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const currentlyPinned =
    String(formData.get("currently_pinned") ?? "false") === "true";
  if (!postId) return;
  if (!(await requireRowEditor("community_posts", postId))) return;
  const admin = createAdminClient();
  await admin
    .from("community_posts")
    .update({ pinned: !currentlyPinned })
    .eq("id", postId);
  revalidatePath("/admin/community");
}

export async function adminDeleteCommentAction(formData: FormData) {
  const commentId = String(formData.get("comment_id") ?? "");
  if (!commentId) return;
  if (!(await requireRowEditor("community_comments", commentId))) return;
  const admin = createAdminClient();
  await admin.from("community_comments").delete().eq("id", commentId);
  revalidatePath("/admin/community");
}

export async function adminDeleteEntryAction(formData: FormData) {
  const entryId = String(formData.get("entry_id") ?? "");
  if (!entryId) return;
  if (!(await requireRowEditor("community_challenge_entries", entryId))) return;
  const admin = createAdminClient();
  await admin.from("community_challenge_entries").delete().eq("id", entryId);
  revalidatePath("/admin/community");
  revalidatePath("/admin/challenges");
}

export async function adminSuspendFanAction(formData: FormData) {
  // fans.suspended is one flag across every community, so only a
  // super-admin may flip it.
  await assertAdmin({ superAdminOnly: true });
  const fanId = String(formData.get("fan_id") ?? "");
  const suspend = String(formData.get("suspend") ?? "true") === "true";
  if (!fanId) return;
  const admin = createAdminClient();
  await admin.from("fans").update({ suspended: suspend }).eq("id", fanId);
  revalidatePath("/admin/fans");
  revalidatePath(`/admin/fans/${fanId}`);
}
