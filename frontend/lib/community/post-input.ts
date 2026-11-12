/**
 * Shared, pure row-building for community_posts.
 *
 * Both composers write the same row shape:
 *   - fan composer   app/artists/[slug]/community/actions.ts createPostAction
 *   - portal composer app/artist-portal/community/actions.ts createPortalPostAction
 *
 * This module has no I/O so it is unit-tested directly
 * (lib/community/post-input.test.ts). The callers do auth, premium gating
 * and the insert; this decides what the row looks like.
 */

import { resolveAuthorVisibility, type PostVisibility } from "../founder-gate/core.ts";

export type PostKind = "post" | "announcement" | "poll" | "challenge";

export const POST_KINDS: readonly PostKind[] = ["post", "announcement", "poll", "challenge"];

export const POST_BODY_MAX = 2000;
export const POST_TITLE_MAX = 160;
export const POST_TAGS_MAX = 6;
export const POST_IMAGE_ALT_MAX = 500;
export const POLL_OPTIONS_MIN = 2;
export const POLL_OPTIONS_MAX = 6;

/** Minimal read interface so tests can pass a plain FormData. */
export interface FormLike {
  get(name: string): FormDataEntryValue | null;
  getAll(name: string): FormDataEntryValue[];
}

/** Everything the composer form carries, normalised but not yet validated. */
export interface PostInput {
  kind: PostKind;
  title: string | null;
  body: string;
  visibility: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  videoPosterUrl: string | null;
  imageAlt: string | null;
  tags: string[];
  captionUsed: boolean;
  /** Raw "Schedule for" value (ISO from the browser) — resolved by buildCommunityPostRow. */
  scheduledForRaw: string | null;
  pollOptions: string[];
}

export function normalizeKind(raw: FormDataEntryValue | null | undefined): PostKind {
  const k = String(raw ?? "post").toLowerCase().trim();
  return (POST_KINDS as readonly string[]).includes(k) ? (k as PostKind) : "post";
}

export function normalizeUrl(raw: FormDataEntryValue | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function normalizeTags(raw: FormDataEntryValue | null | undefined): string[] {
  return String(raw ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0 && t.length <= 24)
    .slice(0, POST_TAGS_MAX);
}

/** Read every composer field off the form. No validation beyond trimming/capping. */
export function readPostInput(form: FormLike): PostInput {
  const imageAltRaw = String(form.get("image_alt") ?? "").trim();
  const titleRaw = String(form.get("title") ?? "").trim();
  const scheduledRaw = String(form.get("scheduled_for") ?? "").trim();
  return {
    kind: normalizeKind(form.get("kind")),
    title: titleRaw ? titleRaw.slice(0, POST_TITLE_MAX) : null,
    body: String(form.get("body") ?? "").trim(),
    visibility: form.get("visibility") == null ? null : String(form.get("visibility")),
    imageUrl: normalizeUrl(form.get("image_url")),
    videoUrl: normalizeUrl(form.get("video_url")),
    videoPosterUrl: normalizeUrl(form.get("video_poster_url")),
    imageAlt: imageAltRaw ? imageAltRaw.slice(0, POST_IMAGE_ALT_MAX) : null,
    tags: normalizeTags(form.get("ai_suggested_tags")),
    captionUsed: String(form.get("caption_used") ?? "0") === "1",
    scheduledForRaw: scheduledRaw || null,
    pollOptions: form
      .getAll("option")
      .map((o) => String(o).trim())
      .filter((o) => o.length > 0),
  };
}

/**
 * Resolve a "Schedule for" value. Returns an ISO timestamp only when the
 * value parses and is strictly in the future (a past or empty value means
 * "publish now"). Only team authors may schedule; fans always get null.
 */
export function resolveScheduledFor(
  raw: string | null | undefined,
  opts: { hasTeamGrant: boolean; now?: Date },
): string | null {
  if (!opts.hasTeamGrant) return null;
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  const now = (opts.now ?? new Date()).getTime();
  if (ms <= now) return null;
  return new Date(ms).toISOString();
}

/** A scheduled post must NOT be announced at creation — the cron does that when due. */
export function shouldNotifyAtCreate(scheduledFor: string | null, now: Date = new Date()): boolean {
  if (!scheduledFor) return true;
  return Date.parse(scheduledFor) <= now.getTime();
}

/** The insert payload. Matches createPostAction's historical row shape. */
export interface CommunityPostRow {
  artist_slug: string;
  author_id: string;
  kind: PostKind;
  title: string | null;
  body: string;
  visibility: PostVisibility;
  pinned: boolean;
  image_url: string | null;
  video_url: string | null;
  video_poster_url: string | null;
  caption_used: boolean;
  tags: string[];
  image_alt: string | null;
  /** Only present when scheduling, so the row still inserts before 0094 is applied. */
  scheduled_for?: string;
  /** Set alongside scheduled_for so the feed orders the post as new when it appears. */
  created_at?: string;
}

export type BuildPostResult =
  | { ok: true; row: CommunityPostRow; notifyAtCreate: boolean; pollOptions: string[] }
  | { ok: false; reason: "empty_body" | "body_too_long" | "poll_options" };

/**
 * Turn validated composer input into the community_posts row.
 *
 *   - `tags` is always an array (NOT NULL default '{}' — null fails the
 *     constraint and used to kill every fan post).
 *   - visibility goes through resolveAuthorVisibility: fans are forced
 *     public, team authors may pick premium / founder-only.
 *   - announcements are pinned by default (same as createAnnouncementAction).
 *   - scheduled_for / created_at are only present when a team author
 *     scheduled the post for the future.
 */
export function buildCommunityPostRow(
  input: PostInput,
  ctx: { artistSlug: string; authorId: string; hasTeamGrant: boolean; now?: Date },
): BuildPostResult {
  if (!input.body) return { ok: false, reason: "empty_body" };
  if (input.body.length > POST_BODY_MAX) return { ok: false, reason: "body_too_long" };
  // Only team authors may post the non-fan kinds.
  const kind: PostKind = ctx.hasTeamGrant ? input.kind : "post";
  if (kind === "poll") {
    const n = input.pollOptions.length;
    if (n < POLL_OPTIONS_MIN || n > POLL_OPTIONS_MAX) return { ok: false, reason: "poll_options" };
  }
  const now = ctx.now ?? new Date();
  const scheduledFor = resolveScheduledFor(input.scheduledForRaw, { hasTeamGrant: ctx.hasTeamGrant, now });

  const row: CommunityPostRow = {
    artist_slug: ctx.artistSlug,
    author_id: ctx.authorId,
    kind,
    title: kind === "post" || kind === "poll" ? null : input.title,
    body: input.body,
    visibility: resolveAuthorVisibility(input.visibility, { hasTeamGrant: ctx.hasTeamGrant }),
    pinned: kind === "announcement",
    image_url: kind === "poll" ? null : input.imageUrl,
    video_url: kind === "post" || kind === "announcement" ? input.videoUrl : null,
    video_poster_url: kind === "post" || kind === "announcement" ? input.videoPosterUrl : null,
    caption_used: input.captionUsed,
    tags: input.tags.slice(0, POST_TAGS_MAX),
    image_alt: input.imageAlt,
  };
  if (scheduledFor) {
    row.scheduled_for = scheduledFor;
    row.created_at = scheduledFor;
  }
  return {
    ok: true,
    row,
    notifyAtCreate: shouldNotifyAtCreate(scheduledFor, now),
    pollOptions: kind === "poll" ? input.pollOptions.slice(0, POLL_OPTIONS_MAX) : [],
  };
}
