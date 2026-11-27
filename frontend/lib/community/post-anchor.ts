/**
 * Where a single community post lives on its artist's community page.
 * The post card sets postAnchorId as its id, and links elsewhere jump
 * to it with postCommunityHref.
 */

export function postAnchorId(postId: string): string {
  return `post-${postId}`;
}

export function postCommunityHref(artistSlug: string, postId: string): string {
  return `/artists/${artistSlug}/community#${postAnchorId(postId)}`;
}
