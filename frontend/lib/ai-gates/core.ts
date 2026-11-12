/**
 * AI feature gates — pure resolution logic (unit-tested, no Next imports).
 *
 * Resolution order for "is <feature> free for every fan in <community>":
 *   1. a row in public.ai_feature_gates (0091)  → its `enabled`
 *   2. no row → the env fallback (today only AI_DRAFTER_FREE_COMMUNITIES,
 *      which applies to ai_comment_drafter; other features have no env)
 *   3. nothing → off (Premium path / unavailable)
 */
import { isAiDrafterFreeForCommunity } from "../entitlements-core.ts";

export const AI_FEATURES = [
  {
    key: "ai_comment_drafter",
    label: "AI comment drafter",
    description: "3 reply drafts in the comment composer (/api/ai/draft-comment). Premium perk unless enabled here.",
    wired: true,
    envVar: "AI_DRAFTER_FREE_COMMUNITIES",
  },
  {
    key: "ai_post_drafts",
    label: "AI post drafts",
    description: "Artist-side post draft generation (cron post-drafts).",
    wired: false,
    envVar: null,
  },
  {
    key: "ai_thread_summary",
    label: "AI thread summary",
    description: "Comment-thread summaries on long posts.",
    wired: false,
    envVar: null,
  },
  {
    key: "ai_copilot",
    label: "AI copilot",
    description: "Artist-portal copilot briefs.",
    wired: false,
    envVar: null,
  },
] as const;

export type AiFeatureKey = (typeof AI_FEATURES)[number]["key"];

export function isAiFeatureKey(raw: string): raw is AiFeatureKey {
  return AI_FEATURES.some((f) => f.key === raw);
}

export type AiGateSource = "row" | "env" | "off";

export interface AiGateResolution {
  enabled: boolean;
  /** Which layer decided. "off" means no row and no env match. */
  source: AiGateSource;
  /** What the env fallback says on its own (for the greyed admin display). */
  envEnabled: boolean;
}

/** The env fallback for a feature. Only the drafter has one today. */
export function envFallbackFor(
  feature: AiFeatureKey,
  communityId: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (feature === "ai_comment_drafter") {
    return isAiDrafterFreeForCommunity(communityId, env.AI_DRAFTER_FREE_COMMUNITIES);
  }
  return false;
}

/**
 * row > env > off. `row` is the DB row's `enabled` (null/undefined = no row).
 */
export function resolveAiGate(
  feature: AiFeatureKey,
  communityId: string,
  row: boolean | null | undefined,
  env: Record<string, string | undefined> = process.env,
): AiGateResolution {
  const envEnabled = envFallbackFor(feature, communityId, env);
  if (typeof row === "boolean") return { enabled: row, source: "row", envEnabled };
  if (envEnabled) return { enabled: true, source: "env", envEnabled };
  return { enabled: false, source: "off", envEnabled };
}
