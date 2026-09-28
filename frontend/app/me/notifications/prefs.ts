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
  quiet_start: null,
  quiet_end: null,
};
