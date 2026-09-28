"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import {
  evaluateSegment,
  generateSegmentFilter,
  type SegmentFilter,
} from "@/lib/segments";

async function requireAdminCommunity(): Promise<{
  communityId: string;
  userId: string;
}> {
  // Act on the community the admin currently has selected, and only when
  // they hold at least the "admin" role there (or are a super-admin).
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");
  const communityId = ctx.currentCommunityId ?? "";
  if (!communityId) redirect("/admin");
  const guard = await authorizeAdmin({ communityId, minRole: "admin" }, ctx);
  if (!guard.ok) throw new Error("Forbidden");
  return { communityId, userId: ctx.user.id };
}

export async function createSegmentAction(formData: FormData) {
  const { communityId, userId } = await requireAdminCommunity();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name || !description) return;
  if (name.length > 80 || description.length > 400) return;

  let filter: SegmentFilter | null = null;
  try {
    filter = await generateSegmentFilter(description);
  } catch (e) {
    console.warn("[segments] generate failed:", e);
    return;
  }
  if (!filter) return;

  const matches = await evaluateSegment(filter, communityId);
  const fanIds = matches.map((m) => m.fan_id);

  const admin = createAdminClient();
  await admin.from("audience_segments").insert({
    artist_slug: communityId,
    name,
    description_input: description,
    filter_json: filter,
    member_count: matches.length,
    fan_ids: fanIds,
    created_by: userId,
    refreshed_at: new Date().toISOString(),
  });

  revalidatePath("/admin/segments");
}

export async function refreshSegmentAction(formData: FormData) {
  const { communityId } = await requireAdminCommunity();

  const segmentId = String(formData.get("segment_id") ?? "");
  if (!segmentId) return;

  const admin = createAdminClient();
  const { data: seg } = await admin
    .from("audience_segments")
    .select("filter_json, artist_slug")
    .eq("id", segmentId)
    .eq("artist_slug", communityId)
    .maybeSingle();
  if (!seg) return;

  const matches = await evaluateSegment(
    seg.filter_json as SegmentFilter,
    seg.artist_slug as string,
  );
  await admin
    .from("audience_segments")
    .update({
      member_count: matches.length,
      fan_ids: matches.map((m) => m.fan_id),
      refreshed_at: new Date().toISOString(),
    })
    .eq("id", segmentId);

  revalidatePath("/admin/segments");
}

export async function deleteSegmentAction(formData: FormData) {
  const { communityId } = await requireAdminCommunity();

  const segmentId = String(formData.get("segment_id") ?? "");
  if (!segmentId) return;

  const admin = createAdminClient();
  await admin
    .from("audience_segments")
    .delete()
    .eq("id", segmentId)
    .eq("artist_slug", communityId);

  revalidatePath("/admin/segments");
}
