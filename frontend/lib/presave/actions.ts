"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { awardPoints } from "@/lib/points/award";
import { withPointsProgress } from "@/lib/points/lifetime";
import type { PointsProgress } from "@/lib/points/progress";
import {
  PRESAVE_ACTION_KIND,
  PRESAVE_POINT_SOURCE,
  isPresaveLive,
  presaveAwardRef,
} from "./core";

export type PresaveActionResult =
  | (PointsProgress & { ok: true; alreadyDone: boolean })
  | { ok: false; error: string };

/**
 * Fan clicked "Pre-save". The client already opened the DSP link in a new
 * tab; this records the click-through and pays the thank-you points once.
 *
 *  1. completion row — fan_action_completions (PK fan_id, action_id) is the
 *     per-fan-per-campaign record; a second click conflicts and we stop.
 *  2. award — awardPoints(source 'presave', ref 'presave:<action>:<fan>');
 *     apply_points_award() refuses a duplicate source_ref, so even a retry
 *     that somehow passes step 1 pays nothing twice. Before 0091 the
 *     award_fan_action_points trigger already paid on insert (as
 *     'social_share'); the completion row then carries points_awarded > 0
 *     and we skip our own award.
 *
 * Returns the progress payload for the "+50 pts · N to Gold" toast.
 */
export async function completePresaveAction(formData: FormData): Promise<PresaveActionResult> {
  const actionId = String(formData.get("action_id") ?? "").trim();
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  if (!actionId || !artistSlug) return { ok: false, error: "Missing campaign." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to earn points for this." };

  const admin = createAdminClient();
  type ActionRow = {
    id: string;
    kind: string;
    artist_slug: string | null;
    point_value: number | null;
    active: boolean | null;
    ends_at: string | null;
    release_date?: string | null;
  };
  let action: ActionRow | null = null;
  const first = await admin
    .from("fan_actions")
    .select("id, kind, artist_slug, point_value, active, ends_at, release_date")
    .eq("id", actionId)
    .maybeSingle();
  if (first.error && /release_date/i.test(first.error.message)) {
    // 0091 not applied yet — no release_date column, no date gating.
    const second = await admin
      .from("fan_actions")
      .select("id, kind, artist_slug, point_value, active, ends_at")
      .eq("id", actionId)
      .maybeSingle();
    if (second.error) {
      console.error("[presave] action read failed", second.error);
      return { ok: false, error: "Couldn't load this pre-save. Please try again." };
    }
    action = (second.data as ActionRow | null) ?? null;
  } else if (first.error) {
    console.error("[presave] action read failed", first.error);
    return { ok: false, error: "Couldn't load this pre-save. Please try again." };
  } else {
    action = (first.data as ActionRow | null) ?? null;
  }
  if (!action || action.kind !== PRESAVE_ACTION_KIND || action.artist_slug !== artistSlug) {
    return { ok: false, error: "This pre-save is no longer available." };
  }
  if (
    !isPresaveLive({
      active: action.active,
      release_date: action.release_date ?? null,
      ends_at: action.ends_at,
    })
  ) {
    return { ok: false, error: "This pre-save has ended." };
  }

  const points = Math.max(0, Number(action.point_value ?? 0));
  const ref = presaveAwardRef(actionId, user.id);

  const { result, progress } = await withPointsProgress(user.id, async () => {
    // Step 1 — the per-fan record. RLS: fan_action_completions_insert_own.
    const { data: inserted, error } = await supabase
      .from("fan_action_completions")
      .insert({ fan_id: user.id, action_id: actionId, community_id: artistSlug })
      .select("points_awarded")
      .maybeSingle();
    if (error) {
      // 23505 = already completed. Anything else is a real failure.
      if (error.code === "23505") return { alreadyDone: true };
      console.error("[presave] completion insert failed", error);
      throw new Error("Couldn't record your pre-save. Please try again.");
    }
    const paidByTrigger = Number(inserted?.points_awarded ?? 0) > 0;
    if (paidByTrigger || points <= 0) return { alreadyDone: false };

    // Step 2 — the honest ledger row. Dedups on `ref` inside apply_points_award.
    await awardPoints(admin, {
      fanId: user.id,
      delta: points,
      source: PRESAVE_POINT_SOURCE,
      sourceRef: ref,
      note: "Pre-save click-through",
      communityId: artistSlug,
    });
    return { alreadyDone: false };
  });

  revalidatePath(`/artists/${artistSlug}`);
  revalidatePath(`/artists/${artistSlug}/community`);
  return { ok: true, alreadyDone: result.alreadyDone, ...progress };
}
