import { sendNotification } from "../send";
import { inboxDay, inboxDedupKey, inboxMonth, type InboxMirror } from "../inbox-mirror";
import {
  firstPlaceCopy,
  monthEndNudgeCopy,
  overtakenCopy,
  type ReminderCopy,
} from "../reminder-copy";

type LeaderboardReminder = "leaderboard_overtaken" | "leaderboard_first_place" | "leaderboard_month_nudge";

/**
 * Inbox copy of a leaderboard reminder: one per fan, per artist, per
 * period (a UTC day, or the month for the month-end nudge).
 */
function leaderboardInbox(
  kind: LeaderboardReminder,
  copy: ReminderCopy,
  artistSlug: string | undefined,
  period: string,
): InboxMirror {
  return {
    kind,
    dedupKey: inboxDedupKey(kind, artistSlug ?? "all", period),
    body: copy.inboxBody,
    url: copy.url,
    communityId: artistSlug ?? null,
  };
}

/**
 * Notify a fan that another fan just overtook them on the leaderboard.
 * Used when today's rank is worse than yesterday's.
 */
export async function notifyOvertaken(opts: {
  fanId: string;
  artistName: string;
  artistSlug?: string;
  newRank: number;
  now?: Date;
}): Promise<void> {
  try {
    const copy = overtakenCopy(opts);
    await sendNotification({
      fanId: opts.fanId,
      type: "leaderboard",
      payload: {
        title: copy.title,
        body: copy.body,
        url: copy.url,
        tag: `leaderboard_overtaken:${opts.fanId}`,
      },
      inbox: leaderboardInbox(
        "leaderboard_overtaken",
        copy,
        opts.artistSlug,
        inboxDay(opts.now ?? new Date()),
      ),
    });
  } catch (err) {
    console.warn("notifyOvertaken failed (non-blocking):", err);
  }
}

/**
 * Notify a fan that they have reached #1 on an artist leaderboard.
 */
export async function notifyFirstPlace(opts: {
  fanId: string;
  artistName: string;
  artistSlug?: string;
  now?: Date;
}): Promise<void> {
  try {
    const copy = firstPlaceCopy(opts);
    await sendNotification({
      fanId: opts.fanId,
      type: "leaderboard",
      payload: {
        title: copy.title,
        body: copy.body,
        url: copy.url,
        tag: `leaderboard_first_place:${opts.fanId}`,
      },
      inbox: leaderboardInbox(
        "leaderboard_first_place",
        copy,
        opts.artistSlug,
        inboxDay(opts.now ?? new Date()),
      ),
    });
  } catch (err) {
    console.warn("notifyFirstPlace failed (non-blocking):", err);
  }
}

/**
 * Month-end nudge: remind fans still on the leaderboard how many days
 * are left so they can make a final push. The push can go out on each of
 * the last days; the inbox gets one row for the month.
 */
export async function notifyMonthEndNudge(opts: {
  fanId: string;
  artistName: string;
  artistSlug?: string;
  rank: number;
  daysLeft: number;
  now?: Date;
}): Promise<void> {
  try {
    const copy = monthEndNudgeCopy(opts);
    await sendNotification({
      fanId: opts.fanId,
      type: "leaderboard",
      payload: {
        title: copy.title,
        body: copy.body,
        url: copy.url,
        tag: `leaderboard_month_nudge:${opts.fanId}`,
      },
      inbox: leaderboardInbox(
        "leaderboard_month_nudge",
        copy,
        opts.artistSlug,
        inboxMonth(opts.now ?? new Date()),
      ),
    });
  } catch (err) {
    console.warn("notifyMonthEndNudge failed (non-blocking):", err);
  }
}
