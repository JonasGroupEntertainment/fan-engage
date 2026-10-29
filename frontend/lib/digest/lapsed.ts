import { DEFAULT_COMMUNITY_SLUG } from "../community-default.ts";

/**
 * "We miss you" pass of the weekly digest (Sprint 3, item A — ported from
 * Brand Engage Pro's lib/digest/lapsed.ts).
 *
 * Pure functions only: the cron route runs one query per activity signal,
 * folds the rows through `latestActivityByFan`, and hands the result to
 * `selectLapsedFans`. Nothing here touches Supabase, so the window maths
 * and the idempotency filter are unit tested under plain `node --test`.
 *
 * Idempotency lives in public.notification_log: one row per send with
 *   channel           = 'email'
 *   notification_type = LAPSED_NUDGE_KIND ('lapsed_nudge')
 *   status            = 'sent'
 *   metadata.dedup_key = lapsedDedupKey(now)   ('lapsed_nudge:<YYYY-MM-DD>')
 * The route excludes anyone with such a row in the last LAPSED_RESEND_DAYS.
 */

export const LAPSED_MIN_DAYS = 14;
export const LAPSED_MAX_DAYS = 30;
/** A fan gets at most one nudge per this many days. */
export const LAPSED_RESEND_DAYS = 30;
export const LAPSED_NUDGE_KIND = "lapsed_nudge";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One activity timestamp for one fan, from any signal table. */
export type ActivitySignal = {
  fan_id: string;
  /** ISO timestamp (timestamptz) or YYYY-MM-DD (fans.last_active_date). */
  at: string | null | undefined;
};

/** The fans columns the pass reads (audited against 0001/0005/0073). */
export type LapsedFanRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  /** YYYY-MM-DD, written by lib/streaks/touch.ts. */
  last_active_date?: string | null;
  /** Signup; the only signal a fan who never did anything has. */
  created_at?: string | null;
  is_internal?: boolean | null;
};

export type LapsedCandidate = {
  id: string;
  email: string;
  firstName: string;
  /** Whole days since the newest activity signal. */
  daysSinceActivity: number;
  bucket: "lapsed";
  /** The fan's primary community (earliest active membership), else the default. */
  artistSlug: string;
};

export type ActivityBucket = "active" | "lapsed" | "dormant" | "unknown";

function parseAt(at: string | null | undefined): number | null {
  if (!at) return null;
  const s = at.trim();
  if (!s) return null;
  // A bare date (fans.last_active_date) is a UTC day, not local midnight.
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00Z`) : Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Newest activity per fan across every signal. Rows with no fan id or an
 * unparsable timestamp are ignored. Returns epoch milliseconds.
 */
export function latestActivityByFan(signals: Iterable<ActivitySignal>): Map<string, number> {
  const latest = new Map<string, number>();
  for (const row of signals) {
    const id = row?.fan_id;
    if (!id) continue;
    const ms = parseAt(row.at);
    if (ms === null) continue;
    const prev = latest.get(id);
    if (prev === undefined || ms > prev) latest.set(id, ms);
  }
  return latest;
}

/** Whole days between the newest activity and `now` (negative clamps to 0). */
export function daysSince(lastActivityMs: number, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - lastActivityMs) / DAY_MS));
}

/**
 * Where a fan sits relative to the nudge window. The window is inclusive:
 * exactly 14 and exactly 30 days both count as lapsed. A fan with no signal
 * at all is "unknown" and is never nudged (we cannot say they left).
 */
export function activityBucket(
  lastActivityMs: number | null | undefined,
  now: Date,
): ActivityBucket {
  if (lastActivityMs === null || lastActivityMs === undefined) return "unknown";
  const days = daysSince(lastActivityMs, now);
  if (days < LAPSED_MIN_DAYS) return "active";
  if (days > LAPSED_MAX_DAYS) return "dormant";
  return "lapsed";
}

/**
 * The newest signal for one fan: the folded signal tables plus the two
 * columns on the fans row itself (last_active_date, created_at).
 */
export function fanLastActivity(
  fan: Pick<LapsedFanRow, "id" | "last_active_date" | "created_at">,
  lastActivity: ReadonlyMap<string, number>,
): number | undefined {
  let last = lastActivity.get(fan.id);
  for (const at of [fan.last_active_date, fan.created_at]) {
    const ms = parseAt(at);
    if (ms !== null && (last === undefined || ms > last)) last = ms;
  }
  return last;
}

/** Primary community: earliest active membership, else the default slug. */
export function primaryArtistSlug(
  slugs: readonly string[] | undefined,
  fallback: string = DEFAULT_COMMUNITY_SLUG,
): string {
  return slugs && slugs.length > 0 ? slugs[0] : fallback;
}

/**
 * Fans who should get a nudge this run.
 *
 *  - newest activity 14–30 days ago (inclusive)
 *  - has an email (fans.email) — the route already filters
 *    fans.email_opted_in = true and fans.suspended = false
 *  - not internal (fans.is_internal)
 *  - not in `digestOptOut` (notification_preferences.notify_weekly_digest = false)
 *  - not in `recentlyNudged` (a lapsed_nudge notification_log row inside 30 days)
 *
 * Order follows `fans`, so callers' testEmail slicing stays stable.
 */
export function selectLapsedFans({
  fans,
  lastActivity,
  artistSlugsByFan,
  recentlyNudged,
  digestOptOut,
  now,
  defaultSlug = DEFAULT_COMMUNITY_SLUG,
}: {
  fans: readonly LapsedFanRow[];
  lastActivity: ReadonlyMap<string, number>;
  artistSlugsByFan: ReadonlyMap<string, readonly string[]>;
  recentlyNudged: ReadonlySet<string>;
  digestOptOut?: ReadonlySet<string>;
  now: Date;
  defaultSlug?: string;
}): LapsedCandidate[] {
  const out: LapsedCandidate[] = [];
  for (const f of fans) {
    if (!f?.id) continue;
    const email = (f.email ?? "").trim();
    if (!email) continue;
    if (f.is_internal) continue;
    if (recentlyNudged.has(f.id)) continue;
    if (digestOptOut?.has(f.id)) continue;

    const last = fanLastActivity(f, lastActivity);
    if (activityBucket(last, now) !== "lapsed") continue;

    out.push({
      id: f.id,
      email,
      firstName: (f.first_name ?? "").trim() || "there",
      daysSinceActivity: daysSince(last as number, now),
      bucket: "lapsed",
      artistSlug: primaryArtistSlug(artistSlugsByFan.get(f.id), defaultSlug),
    });
  }
  return out;
}

/** Bucket counts for a dry run (every fan the route fetched, before filters). */
export function countBuckets(
  fans: readonly Pick<LapsedFanRow, "id" | "last_active_date" | "created_at">[],
  lastActivity: ReadonlyMap<string, number>,
  now: Date,
): Record<ActivityBucket, number> {
  const counts: Record<ActivityBucket, number> = { active: 0, lapsed: 0, dormant: 0, unknown: 0 };
  for (const f of fans) {
    if (!f?.id) continue;
    counts[activityBucket(fanLastActivity(f, lastActivity), now)] += 1;
  }
  return counts;
}

/**
 * Group membership rows by fan, preserving row order (callers order by
 * joined_at so index 0 is the primary community).
 */
export function groupMemberships(
  rows: Iterable<{ fan_id: string; community_id: string }>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const r of rows) {
    if (!r?.fan_id || !r.community_id) continue;
    const list = out.get(r.fan_id);
    if (list) {
      if (!list.includes(r.community_id)) list.push(r.community_id);
    } else out.set(r.fan_id, [r.community_id]);
  }
  return out;
}

/**
 * Fan ids that already got a lapsed nudge inside the resend window.
 * `rows` are notification_log rows with notification_type = LAPSED_NUDGE_KIND
 * and status = 'sent'.
 */
export function recentlyNudgedIds(
  rows: Iterable<{ fan_id: string; sent_at: string | null | undefined }>,
  now: Date,
  withinDays: number = LAPSED_RESEND_DAYS,
): Set<string> {
  const cutoff = now.getTime() - withinDays * DAY_MS;
  const out = new Set<string>();
  for (const r of rows) {
    const ms = parseAt(r?.sent_at);
    if (ms === null || ms < cutoff) continue;
    if (r.fan_id) out.add(r.fan_id);
  }
  return out;
}

/** The dedup key recorded with each send: one nudge per fan per day at most. */
export function lapsedDedupKey(now: Date): string {
  return `${LAPSED_NUDGE_KIND}:${now.toISOString().slice(0, 10)}`;
}

/** ISO cutoff for "inside the resend window" queries. */
export function lapsedResendCutoffIso(now: Date, withinDays: number = LAPSED_RESEND_DAYS): string {
  return new Date(now.getTime() - withinDays * DAY_MS).toISOString();
}

/** ISO cutoff for the oldest activity row worth fetching (LAPSED_MAX_DAYS + 1). */
export function lapsedActivityCutoffIso(now: Date): string {
  return new Date(now.getTime() - (LAPSED_MAX_DAYS + 1) * DAY_MS).toISOString();
}
