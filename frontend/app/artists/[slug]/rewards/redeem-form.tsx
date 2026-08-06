"use client";

import { useState } from "react";
import { redeemRewardAction } from "./actions";
import ShareButton from "@/components/share-button";

interface RedeemFormProps {
  rewardId: string;
  rewardTitle: string;
  pointCost: number;
  /** Artist slug from the route — used to build the share URL. */
  artistSlug: string;
  /** Artist display name — used in the share message body. */
  artistName: string;
  /** Current fan's profile handle — used to link to /fans/<handle>
   *  from the success state so the fan can see their updated profile. */
  fanHandle?: string | null;
  onSuccess: () => void;
  onClose: () => void;
}

export function RedeemForm({
  rewardId,
  rewardTitle,
  pointCost,
  artistSlug,
  artistName,
  fanHandle,
  onSuccess,
  onClose,
}: RedeemFormProps) {
  const [deliveryDetails, setDeliveryDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phase: shareability sprint adds a "redeemed" success view that lets
  // the fan share the win before closing the modal. Previously the modal
  // just closed silently on success — felt like "did anything happen?"
  const [redeemed, setRedeemed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("rewardId", rewardId);
    formData.append("deliveryDetails", deliveryDetails);

    const result = await redeemRewardAction(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Show the success/share state instead of closing immediately.
    setRedeemed(true);
    setLoading(false);
  }

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app";
  const artistUrl = `${appUrl}/artists/${artistSlug}`;
  const shareTitle = `I just redeemed ${rewardTitle} on Fan Engage`;
  const shareText = `Cashed in ${pointCost.toLocaleString()} points for ${rewardTitle} from ${artistName}'s fan experience. ${artistUrl}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="glass-card w-full max-w-md rounded-2xl p-6">
        {redeemed ? (
          // ─── Success state ──────────────────────────────────────────
          // Big "you got it" moment with a share CTA. The notification
          // trigger fires server-side via redeemRewardAction → the fan
          // also sees the redemption land in their inbox; this UI just
          // closes the loop visually before they leave the page.
          <div className="text-center">
            <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-3xl">
              🎉
            </div>
            <h2 className="text-xl font-semibold">Redeemed!</h2>
            <p className="mt-1 text-sm text-white/70">
              {rewardTitle}
            </p>
            <p className="mt-1 text-xs text-white/50">
              {pointCost.toLocaleString()} points spent. {artistName} will be in
              touch about delivery.
            </p>

            <div className="mt-6 flex flex-col items-center gap-3">
              <ShareButton
                title={shareTitle}
                text={shareText}
                url={artistUrl}
                label="Share this drop"
                variant="primary"
              />
              {fanHandle && (
                <a
                  href={`/fans/${fanHandle}`}
                  className="text-xs text-white/65 underline hover:text-white"
                >
                  View your updated profile →
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  setRedeemed(false);
                  onSuccess();
                }}
                className="text-xs text-white/60 hover:text-white"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          // ─── Original confirm-and-redeem form ───────────────────────
          <>
            <h2 className="text-lg font-semibold">{rewardTitle}</h2>
            <p className="mt-1 text-sm text-white/60">
              Cost: {pointCost.toLocaleString()} points
            </p>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="delivery-details" className="block text-xs font-medium uppercase tracking-wide text-white/80">
                  Delivery Details (optional)
                </label>
                <textarea
                  id="delivery-details"
                  value={deliveryDetails}
                  onChange={(e) => setDeliveryDetails(e.target.value)}
                  placeholder="E.g., shirt size, shipping address hint, etc."
                  aria-describedby={error ? "redeem-form-error" : "delivery-details-hint"}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-white/30 focus:outline-none"
                  rows={3}
                />
                <p id="delivery-details-hint" className="sr-only">
                  Optional details the artist needs to fulfill this reward, such as size or shipping address.
                </p>
              </div>

              {error && (
                <div id="redeem-form-error" role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? "Redeeming..." : "Confirm Redeem"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
