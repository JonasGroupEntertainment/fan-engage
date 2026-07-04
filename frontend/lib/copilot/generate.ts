import { createAdminClient } from "@/lib/supabase/admin";
import { gatherCommunityPulse, type CommunityPulse } from "./gather";

/**
 * Artist Copilot — brief generation.
 *
 * Turns a CommunityPulse into a short, actionable brief for the artist
 * portal: a headline, 2-4 insights, and 3-5 recommended actions (each
 * with an optional ready-to-post draft). Pinned to claude-haiku-4-5,
 * same pattern as moderation/drafts/admin-brief. Falls back to a
 * deterministic brief when no API key or the call fails, so the page
 * always renders.
 *
 * Briefs are cached in copilot_briefs; the portal shows the latest and
 * offers a refresh (rate-limited to one generation per hour).
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

export const COPILOT_MODEL = "claude-haiku-4-5";
export const COPILOT_PROMPT_VERSION = "v1";

/** Minimum minutes between generations per community. */
const REFRESH_COOLDOWN_MINUTES = 60;

export interface CopilotAction {
  title: string;
  why: string;
  suggestedPost?: string | null;
}

export interface CopilotBrief {
  headline: string;
  insights: string[];
  actions: CopilotAction[];
  generatedAt: string;
  model: string;
  fallback: boolean;
  pulse: CommunityPulse;
}

interface StoredBrief {
  payload: Omit<CopilotBrief, "generatedAt">;
  generated_at: string;
}

export async function getLatestBrief(
  communityId: string,
): Promise<CopilotBrief | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("copilot_briefs")
    .select("payload, generated_at")
    .eq("community_id", communityId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as StoredBrief;
  return { ...row.payload, generatedAt: row.generated_at };
}

/**
 * Generate a fresh brief (respecting the cooldown unless force=true —
 * force is still bounded to one per 5 minutes to protect the API).
 * Returns the new brief, or the latest cached one if inside cooldown.
 */
export async function generateBrief(
  communityId: string,
  { force = false }: { force?: boolean } = {},
): Promise<CopilotBrief> {
  const latest = await getLatestBrief(communityId);
  const cooldownMs = (force ? 5 : REFRESH_COOLDOWN_MINUTES) * 60_000;
  if (latest && Date.now() - new Date(latest.generatedAt).getTime() < cooldownMs) {
    return latest;
  }

  const pulse = await gatherCommunityPulse(communityId);
  let brief: Omit<CopilotBrief, "generatedAt">;
  try {
    brief = await callClaude(pulse);
  } catch (err) {
    console.warn("copilot generate failed, using fallback:", err);
    brief = fallbackBrief(pulse);
  }

  const admin = createAdminClient();
  const { data: inserted } = await admin
    .from("copilot_briefs")
    .insert({
      community_id: communityId,
      payload: brief,
      model: brief.fallback ? null : COPILOT_MODEL,
      prompt_version: COPILOT_PROMPT_VERSION,
    })
    .select("generated_at")
    .maybeSingle();

  return {
    ...brief,
    generatedAt:
      (inserted?.generated_at as string | undefined) ?? new Date().toISOString(),
  };
}

async function callClaude(
  pulse: CommunityPulse,
): Promise<Omit<CopilotBrief, "generatedAt">> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackBrief(pulse);

  const system = [
    "You are the Fan Engage Pro artist copilot — a sharp, warm community manager advising an artist's team.",
    "You receive a JSON snapshot of their fan community's last 7-30 days.",
    "Reply with ONLY valid JSON: {\"headline\": string, \"insights\": string[], \"actions\": [{\"title\": string, \"why\": string, \"suggestedPost\": string|null}]}.",
    "headline: one sentence, the single most important thing this week. Concrete, warm, no hype-speak.",
    "insights: 2-4 short observations grounded in the numbers (call out trends, risks, wins). Mention quiet high-value fans if any.",
    "actions: 3-5 concrete things the team can do THIS WEEK inside the platform (post, shout out a fan by name, nudge RSVPs, fulfill redemptions, add a campaign goal). Each 'why' cites a number from the data. suggestedPost: a ready-to-paste community post (2-3 sentences, artist's voice, no hashtag spam) for actions that are posts; null otherwise.",
    "Never invent numbers. Never recommend off-platform ad spend. Keep the whole brief scannable.",
  ].join("\n");

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
    },
    body: JSON.stringify({
      model: COPILOT_MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: JSON.stringify(pulse) }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);

  const json = (await res.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const text = json.content.find((c) => c.type === "text")?.text ?? "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no JSON in copilot response");
  const parsed = JSON.parse(match[0]) as {
    headline?: string;
    insights?: string[];
    actions?: CopilotAction[];
  };
  if (!parsed.headline || !Array.isArray(parsed.actions)) {
    throw new Error("malformed copilot response");
  }

  return {
    headline: parsed.headline,
    insights: (parsed.insights ?? []).slice(0, 4),
    actions: parsed.actions.slice(0, 5).map((a) => ({
      title: String(a.title ?? ""),
      why: String(a.why ?? ""),
      suggestedPost: a.suggestedPost ? String(a.suggestedPost) : null,
    })),
    model: COPILOT_MODEL,
    fallback: false,
    pulse,
  };
}

/** Deterministic brief when the AI call isn't available. */
function fallbackBrief(pulse: CommunityPulse): Omit<CopilotBrief, "generatedAt"> {
  const insights: string[] = [
    `${pulse.activeFans7d} of ${pulse.memberCount} members were active in the last 7 days.`,
    `${pulse.newMembers7d} new members joined this week (${pulse.newMembers30d} in the last 30 days).`,
  ];
  if (pulse.quietFans.length > 0) {
    insights.push(
      `${pulse.quietFans.length} previously-engaged fans have gone quiet for 2+ weeks.`,
    );
  }

  const actions: CopilotAction[] = [];
  if (pulse.posts7d === 0) {
    actions.push({
      title: "Post something this week",
      why: "No community posts in the last 7 days — fresh posts are the #1 driver of daily visits.",
      suggestedPost: null,
    });
  }
  if (pulse.pendingRedemptions > 0) {
    actions.push({
      title: `Fulfill ${pulse.pendingRedemptions} pending redemption${pulse.pendingRedemptions === 1 ? "" : "s"}`,
      why: "Fans who redeem and get fast fulfillment redeem again.",
      suggestedPost: null,
    });
  }
  if (pulse.nextEvent) {
    actions.push({
      title: `Rally RSVPs for ${pulse.nextEvent.title}`,
      why: `${pulse.nextEvent.rsvps} RSVPs so far — a post with the calendar link reliably lifts turnout.`,
      suggestedPost: null,
    });
  }
  if (pulse.quietFans.length > 0) {
    actions.push({
      title: "Win back quiet fans",
      why: `${pulse.quietFans.length} high-point fans haven't visited in 14+ days — a challenge or exclusive drop gives them a reason to return.`,
      suggestedPost: null,
    });
  }
  if (pulse.topFans.length > 0 && pulse.topFans[0].displayName) {
    actions.push({
      title: `Shout out ${pulse.topFans[0].displayName}`,
      why: "Public recognition of top fans is free and fans screenshot it.",
      suggestedPost: null,
    });
  }

  return {
    headline: `${pulse.displayName}: ${pulse.activeFans7d} active fans this week, ${pulse.newMembers7d} new.`,
    insights,
    actions: actions.slice(0, 5),
    model: "fallback",
    fallback: true,
    pulse,
  };
}
