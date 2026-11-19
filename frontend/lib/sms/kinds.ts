/**
 * Every SMS this app can send, in one list.
 *
 * Mailchimp documents Transactional SMS for non-promotional messages.
 * Whether a promotional text may use Transactional, or must be a
 * Marketing campaign, is still an open question with Mailchimp.
 * Promotional rows stay blocked until MAILCHIMP_SMS_PROMOTIONAL_ENABLED
 * is set. A Marketing-campaign sender can replace the promotional
 * branch in deliver.ts without changing this list or the callers.
 *
 * https://mailchimp.com/developer/transactional/docs/transactional-sms/
 */

export type SmsMessageKind = "transactional" | "promotional";

export const SMS_MESSAGE_CLASSIFICATION = {
  /** Fan just RSVPed. Confirmation of that action. */
  rsvp_confirmation: "transactional",
  /** Admin fulfilled a redemption the fan requested. */
  redemption_fulfilled: "transactional",
  /** Admin denied a redemption and refunded the points. */
  redemption_denied: "transactional",
  /** Someone replied to the fan's own post. */
  comment_on_my_post: "transactional",
  /**
   * HELP or START wording, and only when
   * MAILCHIMP_SMS_SEND_KEYWORD_REPLIES=true. STOP is never answered
   * here because Mailchimp already auto-replies on 10DLC.
   */
  keyword_reply: "transactional",
  /** Onboarding welcome that includes a points call to action. */
  welcome: "promotional",
  /** Admin or owner broadcast from /admin/broadcast. */
  admin_owner_blast: "promotional",
  /** Campaign builder SMS blast. */
  campaign_sms: "promotional",
  /** Limited-time reward went live. */
  drop_launched: "promotional",
  /** Drop is about to expire. */
  drop_expiring: "promotional",
  /** New community post to followers. */
  new_post: "promotional",
  /** Event announcement or fan/event match. */
  event_match: "promotional",
  /** 24h, 1h, or manual reminder to people who RSVPed. */
  event_reminder: "promotional",
  /** Rank change, first place, or month-end nudge. */
  leaderboard: "promotional",
  /** Anniversary celebration, including a points call to action. */
  anniversary: "promotional",
  /** Prediction resolved, including a points call to action. */
  prediction_resolved: "promotional",
  /**
   * Streak reminder. Classified so a future SMS is gated. The streak
   * trigger sends push only today.
   */
  streak_at_risk: "promotional",
} as const;

export type SmsMessageType = keyof typeof SMS_MESSAGE_CLASSIFICATION;

export function smsMessageKind(messageType: SmsMessageType): SmsMessageKind {
  return SMS_MESSAGE_CLASSIFICATION[messageType];
}

export function smsSendClass(messageType: SmsMessageType): {
  messageType: SmsMessageType;
  messageKind: SmsMessageKind;
} {
  return { messageType, messageKind: smsMessageKind(messageType) };
}

const NOTIFICATION_SMS_TYPE = {
  new_post: "new_post",
  event_match: "event_match",
  comment_on_my_post: "comment_on_my_post",
  redemption: "redemption_fulfilled",
  drops: "drop_launched",
  rsvp_confirmation: "rsvp_confirmation",
  leaderboard: "leaderboard",
  streak_at_risk: "streak_at_risk",
} as const;

export type NotificationSmsType = keyof typeof NOTIFICATION_SMS_TYPE;

/** Default SMS class for a notification. Callers override when one notification type covers two texts. */
export function smsSendClassForNotification(
  type: NotificationSmsType,
): ReturnType<typeof smsSendClass> {
  return smsSendClass(NOTIFICATION_SMS_TYPE[type]);
}
