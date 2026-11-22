// Inserts a community post at most once per press of the button, for the
// create actions in app/artists/[slug]/community/actions.ts and
// app/artist-portal/community/actions.ts. The rule itself (and its tests)
// live in ./save-once.ts; this file only talks to Supabase.
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBMIT_KEY_COLUMN, saveOnce, withSubmitKey, type SaveOnceOutcome } from "./save-once";

const POSTS_TABLE = "community_posts";
const POLL_OPTIONS_TABLE = "community_poll_options";

export type SavedPost = { id: string };

/** The columns the repeat lookup is scoped by. Both come from the server, never the form. */
type ScopedPostRow = { author_id: string; artist_slug: string };

/**
 * Insert the row with the client that would have inserted it anyway (the
 * fan's own session for a fan post, the service role for team kinds). When
 * the database says this submit was already saved, the first row is looked
 * up by its id, its author and its artist, so one person can never reach
 * another person's post, and it is returned with isRepeat set. The caller
 * must then skip everything that follows a new post.
 *
 * The lookup uses the service role so that it finds the author's own row
 * whatever its moderation or schedule state. It is safe because author_id
 * and artist_slug are the values the action has already checked.
 */
export function savePostOnce<Row extends ScopedPostRow>(
  client: Pick<SupabaseClient, "from">,
  row: Row,
  submitKey: unknown,
): Promise<SaveOnceOutcome<SavedPost>> {
  return saveOnce<SavedPost>({
    submitKey,
    insert: (key) =>
      client.from(POSTS_TABLE).insert(withSubmitKey(row, key)).select("id").single(),
    findExisting: (key) =>
      createAdminClient()
        .from(POSTS_TABLE)
        .select("id")
        .eq(SUBMIT_KEY_COLUMN, key)
        .eq("author_id", row.author_id)
        .eq("artist_slug", row.artist_slug)
        .maybeSingle(),
  });
}

/**
 * True only when the poll is known to have no options yet. If that cannot
 * be read, the answer is false, so a retry never adds a second set.
 */
export async function pollHasNoOptions(
  admin: Pick<SupabaseClient, "from">,
  postId: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from(POLL_OPTIONS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);
  if (error) {
    console.error("[community] poll options check failed", error.message);
    return false;
  }
  return count === 0;
}
