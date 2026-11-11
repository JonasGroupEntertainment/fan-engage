/**
 * AI-generated 1-line "vibe of the week" summaries per community block.
 *
 * Given a fan's DigestPayload (already gathered by gather.ts), call
 * Claude Haiku 4.5 once per community block to produce a single
 * sentence summarizing what happened. Result is mutated onto each
 * block's `vibe_summary` field.
 *
 * We could batch ALL of a fan's community summaries into one prompt
 * (cheaper, fewer round-trips), but per-community calls give us
 * cleaner failure modes — if one summary fails, we still have the
 * others — and Haiku is fast enough that the latency hit is small
 * (~1 sec per community × at most 3 communities).
 *
 * Keeps API key access in one place via the same client wrapper as
 * lib/moderation/client.ts (different prompt, same model).
 */

import type { DigestPayload, DigestCommunityBlock } from "./types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

export const SUMMARY_MODEL = "claude-haiku-4-5";
export const SUMMARY_PROMPT_VERSION = "v1";

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

export class SummarizeError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "SummarizeError";
  }
}

/**
 * Generate vibe_summary for every community block in the payload.
 * Mutates payload.communities[].vibe_summary in place.
 *
 * If the API key is missing, sets a fallback summary for each community
 * so the email still ships — better to send a less-magical digest than
 * to skip the send entirely.
 */
export async function summarizeAllCommunities(
  payload: DigestPayload,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    for (const c of payload.communities) {
      c.vibe_summary = fallbackSummary(c);
    }
    return;
  }

  // Sequential is fine — at most 3 calls × ~1 sec each. If we ever
  // need to batch, swap to Promise.all with concurrency=3.
  for (const c of payload.communities) {
    try {
      c.vibe_summary = await summarizeOne(c, apiKey);
    } catch (err) {
      console.warn(
        `[digest] summary for ${c.community_id} failed; using fallback:`,
        err instanceof Error ? err.message : String(err),
      );
      c.vibe_summary = fallbackSummary(c);
    }
  }
}

async function summarizeOne(
  block: DigestCommunityBlock,
  apiKey: string,
): Promise<string> {
  const prompt = buildPrompt(block);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      max_tokens: 120,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new SummarizeError(`Anthropic ${response.status}: ${detail}`);
  }

  const json = (await response.json()) as AnthropicMessageResponse;
  const text = json.content.find((c) => c.type === "text")?.text ?? "";
  return cleanSummary(text);
}

function buildSystemPrompt(): string {
  return `You write very short "vibe of the week" summaries for a music
fan experience platform's email digest.

Output exactly ONE sentence, 12-22 words, no leading "This week" or
"Here's what happened". Lead with a verb or a specific reference. Avoid
generic adjectives ("great", "amazing", "exciting"). Reference at least
one specific detail from the posts or events you're given.

Examples of the tone we want:
  * "RaeLynn dropped a tour announcement and fans flooded the comments with
    Tennessee venue requests — Charlotte and Knoxville both trending."
  * "RaeLynn teased a studio session and the merch drop poll has bronze fans
    debating sleeve lengths."
  * "Quiet week in the club — one new poll about setlist closers, six
    replies, no announcements."

NEVER include emoji. NEVER use exclamation points. Keep it newsroom-dry,
not cheerleader-loud.`;
}

function buildPrompt(block: DigestCommunityBlock): string {
  const parts: string[] = [];
  parts.push(`COMMUNITY: ${block.display_name}`);
  parts.push("");

  if (block.topPosts.length > 0) {
    parts.push(`THIS WEEK'S TOP POSTS (${block.topPosts.length}):`);
    for (const p of block.topPosts) {
      const title = p.title ? `[${p.title}] ` : "";
      const body = p.body.length > 240 ? p.body.slice(0, 240) + "…" : p.body;
      parts.push(
        `  • ${title}${body} (reactions: ${p.reaction_count}, comments: ${p.comment_count})`,
      );
    }
    parts.push("");
  } else {
    parts.push("THIS WEEK'S TOP POSTS: (none)");
    parts.push("");
  }

  if (block.upcomingEvents.length > 0) {
    parts.push(`UPCOMING EVENTS (${block.upcomingEvents.length}):`);
    for (const e of block.upcomingEvents) {
      const date = e.event_date ? ` (${e.event_date})` : "";
      const detail = e.detail ? ` — ${e.detail.slice(0, 120)}` : "";
      parts.push(`  • ${e.title}${date}${detail}`);
    }
    parts.push("");
  }

  parts.push("Write the one-sentence vibe summary. Just the sentence, no quotes.");
  return parts.join("\n");
}

function cleanSummary(text: string): string {
  // Strip surrounding quotes if Claude wrapped the output.
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^"+/, "").replace(/"+$/, "");
  cleaned = cleaned.replace(/^'+/, "").replace(/'+$/, "");
  // Hard-cap length so a verbose AI doesn't blow out the email.
  if (cleaned.length > 240) cleaned = cleaned.slice(0, 237) + "…";
  return cleaned;
}

/** Fallback summary when the API isn't available. Just describes what
 *  the fan will see in the email below it. */
function fallbackSummary(block: DigestCommunityBlock): string {
  const postCount = block.topPosts.length;
  const eventCount = block.upcomingEvents.length;
  if (postCount === 0 && eventCount === 0) {
    return `Quiet week in ${block.display_name}'s club.`;
  }
  const parts: string[] = [];
  if (postCount > 0) parts.push(`${postCount} top post${postCount === 1 ? "" : "s"}`);
  if (eventCount > 0)
    parts.push(`${eventCount} upcoming event${eventCount === 1 ? "" : "s"}`);
  return `${block.display_name} this week: ${parts.join(" and ")}.`;
}
