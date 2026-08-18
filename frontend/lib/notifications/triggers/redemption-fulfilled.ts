import { sendNotification } from "../send";

/**
 * Notify a fan when their reward redemption is fulfilled by an admin.
 * Most rewards are physical or experiential — the fan needs to know
 * "your shirt is shipping," "your meet-and-greet is confirmed," etc.
 *
 * This fires at the tail of the admin redemption-fulfill action.
 * `bypassQuietHours` is true: confirmation of a thing the fan paid
 * points for is always welcome.
 */
export async function notifyRedemptionFulfilled(opts: {
  fanId: string;
  redemptionId: string;
  rewardName: string;
  artistSlug?: string;
  fulfillmentNote?: string;
}): Promise<void> {
  try {
    await sendNotification({
      fanId: opts.fanId,
      type: "redemption",
      payload: {
        title: `${opts.rewardName} is on its way`,
        body: opts.fulfillmentNote || "Tap for details on your redemption.",
        url: opts.artistSlug
          ? `/artists/${opts.artistSlug}/rewards`
          : `/inbox`,
        tag: `redemption:${opts.redemptionId}`,
      },
      bypassQuietHours: true,
      bypassSmsTierGate: true,
    });
  } catch (err) {
    console.warn("notifyRedemptionFulfilled failed (non-blocking):", err);
  }
}

/**
 * Notify a fan when their pending redemption is denied / refunded.
 * Same channel logic, different copy.
 */
export async function notifyRedemptionDenied(opts: {
  fanId: string;
  redemptionId: string;
  rewardName: string;
  reason?: string;
  artistSlug?: string;
}): Promise<void> {
  try {
    const reason = opts.reason ? ` Reason: ${opts.reason}` : "";
    await sendNotification({
      fanId: opts.fanId,
      type: "redemption",
      payload: {
        title: `${opts.rewardName} couldn't be fulfilled`,
        body: `Your points have been refunded.${reason}`.slice(0, 140),
        url: opts.artistSlug
          ? `/artists/${opts.artistSlug}/rewards`
          : `/inbox`,
        tag: `redemption:${opts.redemptionId}`,
      },
      bypassQuietHours: true,
      bypassSmsTierGate: true,
    });
  } catch (err) {
    console.warn("notifyRedemptionDenied failed (non-blocking):", err);
  }
}
