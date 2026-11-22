import { sendNotification } from "../send";
import { inboxDedupKey } from "../inbox-mirror";
import { streakAtRiskCopy, utcDateString } from "../../streaks/at-risk";

/**
 * Push a fan whose streak is lost at the next 00:00 UTC unless they show
 * up. `endsAtLocal` is that moment on the fan's own clock ("7 PM"), from
 * lib/streaks/at-risk.ts. Push and inbox, no SMS: a streak reminder is
 * not worth a text. Goes through sendNotification, so push_enabled,
 * notify_streak and quiet hours all apply to the push, and the
 * notification_log rows (type 'streak_at_risk') record the attempt either
 * way. The cron reads today's rows to avoid sending twice. The inbox row
 * is one per fan per UTC day, the streak calendar.
 */
export async function notifyStreakAtRisk(opts: {
  fanId: string;
  currentStreakDays: number;
  endsAtLocal: string;
  now?: Date;
}): Promise<void> {
  try {
    const copy = streakAtRiskCopy(opts.currentStreakDays, opts.endsAtLocal);
    await sendNotification({
      fanId: opts.fanId,
      type: "streak_at_risk",
      channels: ["push"],
      payload: {
        title: copy.title,
        body: copy.body,
        url: copy.url,
        tag: `streak_at_risk:${opts.fanId}`,
      },
      inbox: {
        kind: "streak_at_risk",
        dedupKey: inboxDedupKey("streak_at_risk", utcDateString(opts.now ?? new Date())),
        body: copy.inboxBody,
        url: copy.url,
        communityId: null,
      },
    });
  } catch (err) {
    console.warn("notifyStreakAtRisk failed (non-blocking):", err);
  }
}
