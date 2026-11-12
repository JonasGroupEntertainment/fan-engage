"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function toggleFollowAction(formData: FormData) {
  const artistSlug = String(formData.get("artist_slug") ?? "").trim();
  const wantFollow = String(formData.get("follow") ?? "true") === "true";
  if (!artistSlug) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (wantFollow) {
    await supabase
      .from("fan_artist_following")
      .upsert(
        { fan_id: user.id, artist_slug: artistSlug },
        // fan_artist_following has no UPDATE policy (0006), so a plain
        // upsert (ON CONFLICT DO UPDATE) fails RLS when the row already
        // exists — common now that 0088 backfills follows from memberships.
        { onConflict: "fan_id,artist_slug", ignoreDuplicates: true },
      );
  } else {
    await supabase
      .from("fan_artist_following")
      .delete()
      .eq("fan_id", user.id)
      .eq("artist_slug", artistSlug);
  }

  revalidatePath(`/artists/${artistSlug}`);
  revalidatePath(`/artists/${artistSlug}/community`);
}
