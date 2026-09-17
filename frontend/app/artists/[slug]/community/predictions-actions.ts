"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin";
import { indexRowAsync } from "@/lib/embeddings";
import { moderateRowAsync } from "@/lib/moderation";
import { tagRowAsync } from "@/lib/tagging";
import { resolvePrediction } from "@/lib/predictions/resolve";
import { notifyPredictionResolved } from "@/lib/notifications/triggers/prediction";
import { premiumPath, requirePremiumFeature } from "@/lib/entitlements";

type Visibility = "public" | "premium" | "founder-only";

function normalizeVisibility(raw: FormDataEntryValue | null): Visibility {
  const v = String(raw ?? "public").toLowerCase().trim();
  if (v === "premium" || v === "founder-only") return v;
  return "public";
}

/**
 * Admin-only: create a prediction post.
 *
 * Form fields:
 *   artist_slug, body, title?, visibility?
 *   option (multi-value, 2–6 options)
 *   prediction_closes_at (ISO datetime; required)
 *   points_for_correct (integer; default 50)
 */
export async function createPredictionAction(formData: FormData) {
  const adminUser = await getAdminUser();
  if (!adminUser) return { error: "admin_required" };

  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const visibility = normalizeVisibility(formData.get("visibility"));
  const options = formData
    .getAll("option")
    .map((o) => String(o).trim())
    .filter((o) => o.length > 0);
  const closesAtRaw = String(formData.get("prediction_closes_at") ?? "").trim();
  const pointsRaw = String(formData.get("points_for_correct") ?? "50").trim();
  const pointsForCorrect = Math.max(0, parseInt(pointsRaw, 10) || 50);

  if (!artistSlug || !body || options.length < 2 || options.length > 6) {
    return { error: "missing_or_invalid_fields" };
  }
  if (!closesAtRaw) {
    return { error: "prediction_closes_at_required" };
  }
  let closesAtIso: string;
  try {
    closesAtIso = new Date(closesAtRaw).toISOString();
  } catch {
    return { error: "invalid_close_time" };
  }
  if (new Date(closesAtIso).getTime() <= Date.now()) {
    return { error: "close_time_must_be_future" };
  }

  const admin = createAdminClient();
  const { data: post, error: postErr } = await admin
    .from("community_posts")
    .insert({
      artist_slug: artistSlug,
      author_id: adminUser.id,
      kind: "prediction",
      title: title || null,
      body,
      visibility,
      prediction_closes_at: closesAtIso,
      points_for_correct: pointsForCorrect,
    })
    .select("id")
    .single();
  if (postErr || !post) return { error: postErr?.message ?? "post_insert_failed" };

  const { error: optionsErr } = await admin
    .from("community_poll_options")
    .insert(
      options.map((label, i) => ({
        post_id: post.id,
        label,
        sort_order: i,
      })),
    );
  if (optionsErr) return { error: optionsErr.message };

  // Fire-and-forget AI pipeline same as polls
  indexRowAsync("community_posts", post.id);
  moderateRowAsync("community_posts", post.id);
  tagRowAsync(post.id);

  revalidatePath(`/artists/${artistSlug}/community`);
  return { success: true, postId: post.id };
}

/**
 * Vote on a prediction. Same shape as votePollAction but rejects votes
 * after `prediction_closes_at`.
 */
export async function votePredictionAction(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const optionId = String(formData.get("option_id") ?? "");
  const artistSlug = String(formData.get("artist_slug") ?? "");
  if (!postId || !optionId || !artistSlug) {
    return { error: "missing_fields" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminUser = await getAdminUser();
  if (!adminUser) {
    const gate = await requirePremiumFeature(user.id, artistSlug, "community_react");
    if (!gate.allowed) redirect(premiumPath(artistSlug));
  }

  // Confirm prediction is still open
  const { data: post } = await supabase
    .from("community_posts")
    .select("kind, prediction_closes_at, resolved_at")
    .eq("id", postId)
    .maybeSingle();
  if (!post || post.kind !== "prediction") return { error: "not_a_prediction" };
  if (post.resolved_at) return { error: "already_resolved" };
  if (
    post.prediction_closes_at &&
    new Date(post.prediction_closes_at as string).getTime() <= Date.now()
  ) {
    return { error: "voting_closed" };
  }

  // Replace any existing vote (mirrors votePollAction)
  await supabase
    .from("community_poll_votes")
    .delete()
    .eq("post_id", postId)
    .eq("fan_id", user.id);

  const { error: insertErr } = await supabase
    .from("community_poll_votes")
    .insert({
      post_id: postId,
      fan_id: user.id,
      option_id: optionId,
    });
  if (insertErr) return { error: insertErr.message };

  revalidatePath(`/artists/${artistSlug}/community`);
  return { success: true };
}

/**
 * Admin-only: mark the correct option, batch-award points to correct
 * voters, fire push notification to all voters with the result.
 */
export async function resolvePredictionAction(formData: FormData) {
  const adminUser = await getAdminUser();
  if (!adminUser) return { error: "admin_required" };

  const postId = String(formData.get("post_id") ?? "");
  const correctOptionId = String(formData.get("correct_option_id") ?? "");
  const artistSlug = String(formData.get("artist_slug") ?? "");
  if (!postId || !correctOptionId || !artistSlug) {
    return { error: "missing_fields" };
  }

  let result;
  try {
    result = await resolvePrediction({ postId, correctOptionId });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "resolve_failed",
    };
  }

  // Best-effort push to every voter (correct + incorrect both get notified
  // that it's been resolved — the result reveal itself is the hook).
  notifyPredictionResolved({
    postId,
    artistSlug,
    correctOptionId,
    pointsPerWinner: result.pointsPerWinner,
  }).catch(() => {});

  revalidatePath(`/artists/${artistSlug}/community`);
  return { success: true, ...result };
}
