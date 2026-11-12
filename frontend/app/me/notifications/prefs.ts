/**
 * Shape of the /me/notifications form, aligned to the
 * notification_preferences columns (verified in prod 2026-09-28).
 */
export type Prefs = {
  // Channel toggles
  push_enabled: boolean;
  sms_enabled: boolean;
  // Notification types
  notify_new_post: boolean;
  notify_event_match: boolean;
  notify_comment_on_my_post: boolean;
  notify_redemption: boolean;
  notify_drops: boolean;
  notify_rsvp_confirmation: boolean;
  notify_predictions: boolean;
  notify_anniversaries: boolean;
  notify_leaderboard: boolean;
  notify_weekly_digest: boolean;
  notify_streak: boolean;
  // Quiet hours, 'HH:MM' or null
  quiet_start: string | null;
  quiet_end: string | null;
};

export type ToggleKey = Exclude<keyof Prefs, "quiet_start" | "quiet_end">;

export const TOGGLE_KEYS: ToggleKey[] = [
  "push_enabled",
  "sms_enabled",
  "notify_new_post",
  "notify_event_match",
  "notify_comment_on_my_post",
  "notify_redemption",
  "notify_drops",
  "notify_rsvp_confirmation",
  "notify_predictions",
  "notify_anniversaries",
  "notify_leaderboard",
  "notify_weekly_digest",
  "notify_streak",
];

export const DEFAULT_PREFS: Prefs = {
  push_enabled: false,
  sms_enabled: false,
  notify_new_post: true,
  notify_event_match: true,
  notify_comment_on_my_post: true,
  notify_redemption: true,
  notify_drops: true,
  notify_rsvp_confirmation: true,
  notify_predictions: true,
  notify_anniversaries: true,
  notify_leaderboard: true,
  notify_weekly_digest: true,
  notify_streak: true,
  quiet_start: null,
  quiet_end: null,
};

/**
 * Columns that may not exist yet in prod. notify_streak is migration 0089;
 * until it is applied, the page selects without it and the save action
 * strips it from the upsert, so the form keeps working either way.
 */
export const PENDING_COLUMNS = ["notify_streak"] as const;
export type PendingColumn = (typeof PENDING_COLUMNS)[number];

/** True when a PostgREST error is about one of the pending columns. */
export function isMissingPendingColumn(
  error: { code?: string | null; message?: string | null } | null | undefined,
): PendingColumn | null {
  if (!error) return null;
  const text = `${error.message ?? ""}`;
  for (const col of PENDING_COLUMNS) {
    if (error.code === "42703" && text.includes(col)) return col;
    if (new RegExp(`column .*${col}`, "i").test(text) || new RegExp(`${col}.* column`, "i").test(text)) return col;
  }
  return null;
}
