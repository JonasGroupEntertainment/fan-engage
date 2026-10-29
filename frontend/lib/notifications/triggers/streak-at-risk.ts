import { sendNotification } from "../send";
import { streakAtRiskCopy } from "../../streaks/at-risk";

/**
 * Push a fan whose streak is lost at the next 00:00 UTC unless they show
 * up. `endsAtLocal` is that moment on the fan's own clock ("7 PM"), from
 * lib/streaks/at-risk.ts. Push only: a streak reminder is not worth an
 * SMS. Goes through sendNotification, so push_enabled, notify_streak and
 * quiet hours all apply, and one notification_log row (type
 * 'streak_at_risk') records the attempt either way — the cron reads
 * today's rows to avoid sending twice.
 */
export async function notifyStreakAtRisk(opts: {
  fanId: string;
  currentStreakDays: number;
  endsAtLocal: string;
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
    });
  } catch (err) {
    console.warn("notifyStreakAtRisk failed (non-blocking):", err);
  }
}
