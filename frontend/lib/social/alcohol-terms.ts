/**
 * Spots alcohol and tobacco wording in a team announcement that is about
 * to go to an artist's public Facebook or Instagram. Fans can be 13 to 17
 * and the post goes out in the artist's name, so an announcement that
 * mentions these stays inside the community.
 *
 * Used only by lib/social/social-post.ts. It is not an app wide age rule.
 * Word list ported as is from Brand Engage Pro (lib/alcohol-terms.ts).
 *
 * This is a safety net, not a filter of record: it errs toward flagging.
 * Common soft drinks that contain a flagged word are ignored first.
 */

const SOFT_DRINKS = /\b(root beer|ginger beer|ginger ale|butterbeer|mocktails?|non[- ]alcoholic [a-z]+|alcohol[- ]free [a-z]+|zero[- ]proof [a-z]+)\b/gi;

const ALCOHOL_OR_TOBACCO =
  /\b(alcohol|beers?|ipas?|lagers?|ales?|drafts?|draughts?|wines?|ros[eé]|champagne|prosecco|sangria|whiske?y|whiskies|bourbons?|scotch|tequilas?|mezcal|vodkas?|rum|gin|liquors?|spirits|cocktails?|margaritas?|mimosas?|martinis?|bloody marys?|hard seltzers?|well drinks?|happy hour|shots|booze|cigars?|cigarettes?|tobacco|vapes?)\b/i;

export function mentionsAlcohol(text: string): boolean {
  return ALCOHOL_OR_TOBACCO.test(text.replace(SOFT_DRINKS, " "));
}
