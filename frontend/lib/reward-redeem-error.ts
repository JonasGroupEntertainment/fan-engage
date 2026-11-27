/**
 * Turns a failed redeem_reward call into the line a fan sees.
 *
 * Migration 0112 lets a fan have one waiting redemption of a reward at a
 * time. When two presses arrive together, the second is refused by that
 * rule and nothing is spent; it should read the same as the check the app
 * makes before redeeming. Pure module, no "@/" imports.
 */

/** Shown when the fan already has this reward waiting to be fulfilled. */
export const ALREADY_WAITING_MESSAGE =
  "You already redeemed this and it is waiting to be fulfilled. No more points were spent.";

/** The index added by migration 0112. */
export const ONE_PENDING_INDEX = "reward_redemptions_one_pending_per_reward";

export type RedeemErrorLike = { code?: string | null; message?: string | null } | null | undefined;

export function isAlreadyWaitingError(error: RedeemErrorLike): boolean {
  if (!error) return false;
  return error.code === "23505" && (error.message ?? "").includes(ONE_PENDING_INDEX);
}

/** Shown when the database refuses the text as too long (migration 0113). */
export const DETAILS_TOO_LONG_MESSAGE =
  "Delivery details can be up to 500 characters. Please shorten them and try again.";

export function redeemErrorMessage(error: RedeemErrorLike): string {
  if (isAlreadyWaitingError(error)) return ALREADY_WAITING_MESSAGE;
  if (error?.code === "23514" && (error.message ?? "").includes("delivery_details_length")) {
    return DETAILS_TOO_LONG_MESSAGE;
  }
  return error?.message?.trim() || "We could not redeem that reward. Please try again.";
}
