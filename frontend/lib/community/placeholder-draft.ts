/**
 * Soft-launch: seeded team drafts must not reach fan or guest feeds.
 * Rows stay in the DB (do not delete) — filter / unpublish only.
 *
 * Markers we honor:
 *   - title/body tagged `[Placeholder / draft]` or `[Placeholder]`
 *   - tags `placeholder` or `draft` (0053 seed)
 *   - inactive / draft / unpublished flags when a column exists
 */

const TITLE_OR_BODY_DRAFT =
  /\[placeholder(?:\s*\/\s*draft)?\]|placeholder\s*\/\s*draft/i;

const DRAFT_STATUS = /^(draft|inactive|unpublished|archived)$/i;

export type PlaceholderDraftFields = {
  title?: string | null;
  body?: string | null;
  tags?: string[] | null;
  status?: string | null;
  published?: boolean | null;
  active?: boolean | null;
};

export function isPlaceholderDraftPost(
  post: PlaceholderDraftFields,
): boolean {
  if (post.published === false) return true;
  if (post.active === false) return true;
  if (post.status && DRAFT_STATUS.test(post.status.trim())) return true;

  const tags = (post.tags ?? []).map((t) => t.trim().toLowerCase());
  if (tags.includes("placeholder") || tags.includes("draft")) return true;

  const title = post.title ?? "";
  const body = post.body ?? "";
  return TITLE_OR_BODY_DRAFT.test(title) || TITLE_OR_BODY_DRAFT.test(body);
}

export function rejectPlaceholderDraftPosts<T extends PlaceholderDraftFields>(
  posts: T[],
): T[] {
  return posts.filter((p) => !isPlaceholderDraftPost(p));
}
