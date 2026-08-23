/**
 * lib/personal-feed/compute.ts
 *
 * Picks 3 community posts that should resonate with a specific fan.
 * Pure SQL + TypeScript scoring — no external API calls.
 *
 * Scoring (v1):
 *   tag_match_count * 2  +  recency_score
 *
 *   tag_match_count: how many of fan.interest tokens overlap any tag
 *   recency_score:   linear decay 1.0 (today) → 0.0 (60 days old)
 *
 * Filters: not own post, not commented on by fan, safe, public,
 *          within last 60 days.
 *
 * Falls back to most-recent eligible posts if no matches.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { isPlaceholderDraftPost } from "@/lib/community/placeholder-draft";

const LOOKBACK_DAYS = 60;
const CANDIDATE_LIMIT = 60;

export interface PickedPost {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  image_url: string | null;
  image_alt: string | null;
  tags: string[] | null;
  created_at: string;
  /** Why we picked this post — "tag-match", "recent", or "fallback". */
  reason: "tag-match" | "recent" | "fallback";
}

interface CandidateRow {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  image_url: string | null;
  image_alt: string | null;
  tags: string[] | null;
  created_at: string;
  author_id: string;
}

export async function getPickedForYou(args: {
  fanId: string;
  artistSlug: string;
  limit?: number;
}): Promise<PickedPost[]> {
  const limit = args.limit ?? 3;
  const admin = createAdminClient();
  const cutoffIso = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 1. Pull fan's interest + the post IDs they've commented on (for exclusion).
  const [fanRes, commentsRes] = await Promise.all([
    admin.from("fans").select("interest").eq("id", args.fanId).maybeSingle(),
    admin
      .from("community_comments")
      .select("post_id")
      .eq("author_id", args.fanId),
  ]);

  const interest =
    (fanRes.data as { interest?: string | null } | null)?.interest ?? "";
  const interestTokens = tokenize(interest);
  const commentedPostIds = new Set<string>(
    (commentsRes.data ?? [])
      .map((r) => (r as { post_id?: string | null }).post_id)
      .filter((id): id is string => typeof id === "string"),
  );

  // 2. Pull candidates.
  const { data: candidatesData } = await admin
    .from("community_posts")
    .select(
      "id, kind, title, body, image_url, image_alt, tags, created_at, author_id",
    )
    .eq("artist_slug", args.artistSlug)
    .eq("moderation_status", "safe")
    .eq("visibility", "public")
    .neq("author_id", args.fanId)
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  const candidates = (candidatesData ?? []) as CandidateRow[];
  const eligible = candidates.filter(
    (c) => !commentedPostIds.has(c.id) && !isPlaceholderDraftPost(c),
  );
  if (eligible.length === 0) return [];

  // 3. Score each eligible candidate.
  const now = Date.now();
  const scored = eligible.map((c) => {
    const tags = (c.tags ?? []).map((t) => t.toLowerCase());
    let tagMatchCount = 0;
    if (interestTokens.length > 0) {
      for (const tok of interestTokens) {
        for (const tag of tags) {
          if (tag.includes(tok) || tok.includes(tag)) {
            tagMatchCount += 1;
            break; // count one tag-match per token
          }
        }
      }
    }
    const ageMs = now - new Date(c.created_at).getTime();
    const ageDays = ageMs / 86_400_000;
    const recencyScore = Math.max(0, 1 - ageDays / LOOKBACK_DAYS);

    const score = tagMatchCount * 2 + recencyScore;
    const reason: PickedPost["reason"] =
      tagMatchCount > 0 ? "tag-match" : "recent";

    return { ...c, _score: score, _reason: reason };
  });

  // 4. Sort: highest score first; ties broken by most recent.
  scored.sort((a, b) => {
    if (b._score !== a._score) return b._score - a._score;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // 5. If nothing scored above 0 (no tags, no recency anywhere — unlikely),
  //    fall back to the latest eligible posts marked as "fallback".
  const top = scored.slice(0, limit);
  const allZeroScore = top.every((p) => p._score === 0);
  return top.map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    body: p.body,
    image_url: p.image_url,
    image_alt: p.image_alt,
    tags: p.tags,
    created_at: p.created_at,
    reason: allZeroScore ? "fallback" : p._reason,
  }));
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s,;/]+/)
    .map((t) => t.trim().replace(/[^a-z0-9-]/g, ""))
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  "the", "and", "a", "of", "to", "in", "for", "on", "with", "is",
  "that", "this", "i", "my", "love", "like", "really", "very",
  "music", "songs", "song", "album", "albums", // too generic for this domain
]);
