/**
 * Shared types for the notifications stack.
 *
 * `NotificationType` is the canonical key used across triggers, preferences,
 * and the audit log. Each value also maps 1:1 to the `notify_<x>` columns on
 * `notification_preferences` so we can do a single per-fan opt-in check.
 */

export type NotificationType =
  | "new_post"
  | "event_match"
  | "comment_on_my_post"
  | "redemption"
  | "drops"
  | "rsvp_confirmation"
  | "leaderboard"
  | "streak_at_risk";

export type Channel = "push" | "sms" | "email" | "in_app";

export interface PushPayload {
  title: string;
  body: string;
  /** Click target — relative path on Fan Engage. */
  url?: string;
  /** Optional icon URL (defaults to /icon-192.png if unset). */
  icon?: string;
  /** Optional badge URL (Android badge tray). */
  badge?: string;
  /** Optional tag — same tag = collapses into one notification. */
  tag?: string;
  /** Arbitrary extras forwarded to the service worker. */
  data?: Record<string, unknown>;
}

export interface NotificationPreferences {
  fan_id: string;
  push_enabled: boolean;
  sms_enabled: boolean;
  notify_new_post: boolean;
  notify_event_match: boolean;
  notify_comment_on_my_post: boolean;
  notify_redemption: boolean;
  notify_drops: boolean;
  notify_rsvp_confirmation: boolean;
  notify_leaderboard: boolean;
  /** Streak reminders (migration 0089). */
  notify_streak: boolean;
  quiet_start: string | null;     // 'HH:MM' or null
  quiet_end: string | null;
  timezone: string;
}

export interface PushSubscriptionRow {
  id: string;
  fan_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string | null;
}

/** Map a NotificationType to the matching `notify_*` preference column. */
export function preferenceColumnFor(type: NotificationType): keyof NotificationPreferences {
  switch (type) {
    case "new_post":
      return "notify_new_post";
    case "event_match":
      return "notify_event_match";
    case "comment_on_my_post":
      return "notify_comment_on_my_post";
    case "redemption":
      return "notify_redemption";
    case "drops":
      return "notify_drops";
    case "rsvp_confirmation":
      return "notify_rsvp_confirmation";
    case "leaderboard":
      return "notify_leaderboard";
    case "streak_at_risk":
      return "notify_streak";
  }
}
