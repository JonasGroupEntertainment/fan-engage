/**
 * The reactions a fan can leave on a post. The buttons and the server
 * action both read this list, so only these values are ever stored.
 */
export const REACTION_SET = ["❤️", "🔥", "👏", "💯", "😂"] as const;

export type Reaction = (typeof REACTION_SET)[number];

export function isAllowedReaction(value: unknown): value is Reaction {
  return typeof value === "string" && (REACTION_SET as readonly string[]).includes(value);
}
