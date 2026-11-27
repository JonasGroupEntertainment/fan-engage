import {
  preferenceColumnFor,
  type NotificationPreferences,
  type NotificationType,
} from "./types.ts";

/**
 * Inbox copy of a reminder.
 *
 * Reminders used to go out as web push only, and push is off for most
 * fans, so the reminder was never seen. Every reminder that
 * sendNotification decides for a fan is now also written to the in-app
 * inbox (public.notifications), whether or not the fan has push on.
 *
 * Rules, all pure and tested in inbox-mirror.test.ts:
 *   - one row per reminder occurrence: the dedup key is built from the
 *     reminder kind and its natural period (the streak day, the drop id,
 *     the anniversary milestone), so a cron that runs twice writes once
 *   - no row for a suspended or internal fan, or for a fan who turned
 *     that kind of notice off in /me/notifications
 *   - at most MAX_INBOX_REMINDERS_PER_FAN_PER_DAY rows per fan per UTC
 *     day; when the day is full a more important reminder replaces the
 *     least important unread one, and a less important one is dropped
 *
 * Relative imports and injected reads and writes, so it runs under
 * node --test. lib/notifications/send.ts binds it to Supabase.
 */

/** Most important first. This is the order the daily cap keeps. */
export const INBOX_REMINDER_PRIORITY = [
  "streak_at_risk",
  "drop_expiring",
  "leaderboard_overtaken",
  "comment_on_my_post",
  "leaderboard_first_place",
  "drop_launched",
  "prediction_resolved",
  "anniversary",
  "leaderboard_month_nudge",
  "new_post",
] as const;

/**
 * Never counted and never dropped: news about a reward the fan spent
 * points on, and the notice that they now have enough points for one
 * (at most one per reward per day).
 */
export const UNCAPPED_INBOX_KINDS = ["redemption_update"] as const;

export type CappedInboxKind = (typeof INBOX_REMINDER_PRIORITY)[number];
export type InboxReminderKind = CappedInboxKind | (typeof UNCAPPED_INBOX_KINDS)[number];

/** How many reminder rows one fan can get in one UTC day. */
export const MAX_INBOX_REMINDERS_PER_FAN_PER_DAY = 3;

/** Every dedup key this module writes starts with this, then a colon. */
export const INBOX_DEDUP_PREFIX = "reminder";

const INBOX_LABELS: Record<InboxReminderKind, string> = {
  streak_at_risk: "Streak",
  drop_expiring: "Drops",
  drop_launched: "Drops",
  leaderboard_overtaken: "Leaderboard",
  leaderboard_first_place: "Leaderboard",
  leaderboard_month_nudge: "Leaderboard",
  comment_on_my_post: "Replies",
  prediction_resolved: "Predictions",
  anniversary: "Anniversary",
  new_post: "Posts",
  redemption_update: "Rewards",
};

const INBOX_ICONS: Record<InboxReminderKind, string> = {
  streak_at_risk: "🔥",
  drop_expiring: "⏳",
  drop_launched: "🎁",
  leaderboard_overtaken: "📉",
  leaderboard_first_place: "🥇",
  leaderboard_month_nudge: "🏆",
  comment_on_my_post: "💬",
  prediction_resolved: "🎯",
  anniversary: "🎉",
  new_post: "📣",
  redemption_update: "🎁",
};

/** What a trigger passes to sendNotification to get an inbox copy. */
export type InboxMirror = {
  kind: InboxReminderKind;
  /** From inboxDedupKey: the kind plus its natural period. */
  dedupKey: string;
  /** Wording that still reads right tomorrow. Defaults to the push body. */
  body?: string;
  /** Where the fan can act. Defaults to the push url. */
  url?: string;
  /** The artist community the notice is about, or null for none. */
  communityId: string | null;
};

export type InboxFanRow = { suspended: boolean | null; is_internal: boolean | null };

export type TodaysReminder = {
  id: string;
  kind: string;
  dedup_key: string | null;
  read_at: string | null;
};

export type InboxRow = {
  fan_id: string;
  kind: InboxReminderKind;
  title: string;
  body: string | null;
  url: string | null;
  icon: string;
  dedup_key: string;
  /** Left out when the notice is not about one community. */
  community_id?: string;
};

export type InboxBlockReason = "fan_not_found" | "suspended" | "internal" | "type_opted_out";

export type InboxCapDecision =
  | { action: "write" }
  | { action: "replace"; evictId: string }
  | { action: "skip" };

export type InboxMirrorResult =
  | { status: "written"; replacedId: string | null }
  | { status: "duplicate" }
  | { status: "suppressed"; reason: InboxBlockReason | "daily_cap" }
  | { status: "failed"; error: string };

export type InboxMirrorDeps = {
  loadFan: (fanId: string) => Promise<InboxFanRow | null>;
  /** Reminder rows written for the fan since `sinceIso`. */
  loadTodaysReminders: (fanId: string, sinceIso: string) => Promise<TodaysReminder[]>;
  /** "duplicate" when the dedup key already exists. Throws on anything else. */
  insert: (row: InboxRow) => Promise<"inserted" | "duplicate">;
  remove: (id: string) => Promise<void>;
};

/** "reminder:<kind>:<period parts>", unique per fan in public.notifications. */
export function inboxDedupKey(
  kind: string,
  ...period: ReadonlyArray<string | number>
): string {
  return [INBOX_DEDUP_PREFIX, kind, ...period.map((part) => String(part).trim())].join(":");
}

/** True for a dedup key written by inboxDedupKey. */
export function isReminderDedupKey(dedupKey: string | null | undefined): boolean {
  return Boolean(dedupKey?.startsWith(`${INBOX_DEDUP_PREFIX}:`));
}

/** YYYY-MM-DD on the UTC calendar: the day a daily reminder belongs to. */
export function inboxDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** YYYY-MM on the UTC calendar: the month a monthly reminder belongs to. */
export function inboxMonth(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** The instant the current UTC day began; the cap counts rows since then. */
export function inboxDayStartIso(now: Date): string {
  return `${inboxDay(now)}T00:00:00.000Z`;
}

export function isInboxReminderKind(kind: string): kind is InboxReminderKind {
  return Object.hasOwn(INBOX_LABELS, kind);
}

/** Section heading in /inbox, or null for a kind this module does not own. */
export function inboxReminderLabel(kind: string): string | null {
  return isInboxReminderKind(kind) ? INBOX_LABELS[kind] : null;
}

export function inboxReminderIcon(kind: InboxReminderKind): string {
  return INBOX_ICONS[kind];
}

function priorityRank(kind: string): number {
  const rank = (INBOX_REMINDER_PRIORITY as readonly string[]).indexOf(kind);
  return rank === -1 ? Number.POSITIVE_INFINITY : rank;
}

function isCapped(kind: string): boolean {
  return (INBOX_REMINDER_PRIORITY as readonly string[]).includes(kind);
}

/**
 * Why this fan gets no inbox row, or null when they do. Push being off is
 * not a reason: the inbox is for exactly those fans. A notice type the fan
 * switched off is.
 */
export function inboxBlockReason(input: {
  fan: InboxFanRow | null;
  prefs: NotificationPreferences;
  type: NotificationType;
}): InboxBlockReason | null {
  if (!input.fan) return "fan_not_found";
  if (input.fan.suspended !== false) return "suspended";
  if (input.fan.is_internal !== false) return "internal";
  if (input.prefs[preferenceColumnFor(input.type)] === false) return "type_opted_out";
  return null;
}

/**
 * The daily cap. Under the cap: write. At the cap: replace the least
 * important unread reminder when the new one outranks it, otherwise skip.
 * A reminder the fan already read is never taken away.
 */
export function inboxCapDecision(
  kind: InboxReminderKind,
  todays: readonly TodaysReminder[],
  cap: number = MAX_INBOX_REMINDERS_PER_FAN_PER_DAY,
): InboxCapDecision {
  if (!isCapped(kind)) return { action: "write" };
  const counted = todays.filter((row) => isCapped(row.kind) && isReminderDedupKey(row.dedup_key));
  if (counted.length < cap) return { action: "write" };

  const weakestUnread = counted
    .filter((row) => !row.read_at)
    .reduce<TodaysReminder | null>(
      (weakest, row) =>
        weakest === null || priorityRank(row.kind) > priorityRank(weakest.kind) ? row : weakest,
      null,
    );
  if (weakestUnread && priorityRank(kind) < priorityRank(weakestUnread.kind)) {
    return { action: "replace", evictId: weakestUnread.id };
  }
  return { action: "skip" };
}

/** The row to insert. Title is the push title; body and url may differ. */
export function buildInboxRow(input: {
  fanId: string;
  mirror: InboxMirror;
  title: string;
  pushBody: string;
  pushUrl?: string;
}): InboxRow {
  const { mirror } = input;
  const base: InboxRow = {
    fan_id: input.fanId,
    kind: mirror.kind,
    title: input.title,
    body: mirror.body ?? input.pushBody ?? null,
    url: mirror.url ?? input.pushUrl ?? null,
    icon: inboxReminderIcon(mirror.kind),
    dedup_key: mirror.dedupKey,
  };
  return mirror.communityId ? { ...base, community_id: mirror.communityId } : base;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Write one reminder to one fan's inbox. Never throws: a failed read or
 * write comes back as `failed`, so the caller's push and the next fan in
 * a cron carry on.
 */
export async function mirrorReminderToInbox(
  deps: InboxMirrorDeps,
  input: {
    fanId: string;
    type: NotificationType;
    prefs: NotificationPreferences;
    mirror: InboxMirror;
    title: string;
    pushBody: string;
    pushUrl?: string;
    now: Date;
  },
): Promise<InboxMirrorResult> {
  try {
    const fan = await deps.loadFan(input.fanId);
    const blocked = inboxBlockReason({ fan, prefs: input.prefs, type: input.type });
    if (blocked) return { status: "suppressed", reason: blocked };

    const todays = await deps.loadTodaysReminders(input.fanId, inboxDayStartIso(input.now));
    if (todays.some((row) => row.dedup_key === input.mirror.dedupKey)) {
      return { status: "duplicate" };
    }
    const decision = inboxCapDecision(input.mirror.kind, todays);
    if (decision.action === "skip") return { status: "suppressed", reason: "daily_cap" };

    const inserted = await deps.insert(buildInboxRow(input));
    if (inserted === "duplicate") return { status: "duplicate" };
    if (decision.action === "replace") {
      await deps.remove(decision.evictId);
      return { status: "written", replacedId: decision.evictId };
    }
    return { status: "written", replacedId: null };
  } catch (err) {
    return { status: "failed", error: errorText(err) };
  }
}
