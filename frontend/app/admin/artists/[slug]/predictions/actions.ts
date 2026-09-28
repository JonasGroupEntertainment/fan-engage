"use server";

import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin";
import { resolvePrediction } from "@/lib/predictions/resolve";

export async function resolveAdminPredictionAction(formData: FormData) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin");

  const predictionId = formData.get("prediction_id") as string | null;
  const winningOutcomeId = formData.get("winning_outcome_id") as string | null;
  const artistSlug = formData.get("artist_slug") as string | null;

  if (!predictionId || !winningOutcomeId || !artistSlug) {
    throw new Error("Missing required fields");
  }

  // resolvePrediction checks the admin against the prediction's own
  // community, so a forged artist_slug here only changes the redirect.
  await resolvePrediction({
    postId: predictionId,
    correctOptionId: winningOutcomeId,
    ctx,
  });

  redirect(`/admin/artists/${artistSlug}/predictions`);
}
