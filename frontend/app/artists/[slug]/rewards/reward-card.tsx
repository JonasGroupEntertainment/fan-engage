"use client";

import { useState } from "react";
import DropCountdown from "@/components/drop-countdown";
import Image from "next/image";
import { RedeemForm } from "./redeem-form";
import InlineShareButton from "@/components/inline-share-button";
import type { RewardRow } from "@/lib/data/rewards";
import { isInAppOnlyLaunchReward } from "@/lib/launch-catalog";

interface RewardCardProps {
  reward: RewardRow;
  /** Artist slug — passed through to RedeemForm so its success-state
   *  share button can build a working share URL.  */
  artistSlug: string;
  /** Artist display name — used in the share message body. */
  artistName: string;
  /** Current fan's profile handle — used by the redeem success state
   *  to surface a "View your updated profile" link. Optional because
   *  RLS or signup races can briefly leave a fan handle-less. */
  fanHandle?: string | null;
  /** Fan's current point balance for this community — used to gate the
   *  Redeem button and surface a clear "earn X more" message. */
  fanPoints?: number;
}

export default function RewardCardWithForm({
  reward,
  artistSlug,
  artistName,
  fanHandle,
  fanPoints = 0,
}: RewardCardProps) {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <div className="glass-card group overflow-hidden rounded-2xl p-4 transition hover:border-white/20">
        {reward.image_url && (
          <div className="relative mb-3 h-32 w-full overflow-hidden rounded-lg bg-black/20">
            <Image
              src={reward.image_url}
              alt={reward.title}
              fill
              className="object-cover"
            />
          </div>
        )}

        <DropCountdown reward={reward} className="mb-2" />
        <h3 className="line-clamp-2 text-sm font-semibold">{reward.title}</h3>

        {reward.description && (
          <p className="mt-1 line-clamp-2 text-xs text-white/60">{reward.description}</p>
        )}

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold text-white">{reward.point_cost.toLocaleString()}</span>
          <span className="text-xs text-white/60">pts</span>
        </div>

        {reward.requires_tier && (
          <div className="mt-2 inline-flex rounded-full bg-amber-500/20 px-2 py-1 text-xs uppercase tracking-wide text-amber-300">
            {reward.requires_tier}
          </div>
        )}

        {reward.stock !== null && (
          <p className="mt-2 text-xs text-white/50">Only {reward.stock} left</p>
        )}

        {fanPoints >= reward.point_cost ? (
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 w-full rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 px-3 py-2 text-xs font-medium text-white hover:opacity-90"
          >
            Redeem →
          </button>
        ) : (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-center">
            <p className="text-xs text-white/50">
              Earn{" "}
              <span className="font-semibold text-white/80">
                {(reward.point_cost - fanPoints).toLocaleString()} more pts
              </span>{" "}
              to unlock
            </p>
          </div>
        )}
        {!isInAppOnlyLaunchReward(reward.title) && (
          <div className="mt-2 flex justify-end">
            <InlineShareButton
              title={reward.title}
              text={`Check out this drop on Fan Engage: ${reward.title} for ${reward.point_cost.toLocaleString()} pts.`}
              url={`${process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app"}/artists/${artistSlug}/rewards`}
              label="↗ Share drop"
              className="text-xs text-white/50 hover:text-white/70 transition"
            />
          </div>
        )}
      </div>

      {showForm && (
        <RedeemForm
          rewardId={reward.id}
          rewardTitle={reward.title}
          pointCost={reward.point_cost}
          artistSlug={artistSlug}
          artistName={artistName}
          fanHandle={fanHandle ?? null}
          onSuccess={() => {
            setShowForm(false);
            // TODO: trigger toast/refresh
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </>
  );
}
