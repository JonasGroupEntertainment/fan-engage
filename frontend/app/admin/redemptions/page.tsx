import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Image from "next/image";
import RedemptionAction from "./redemption-action";
import { listPendingRedemptions } from "@/lib/data/rewards";

export const dynamic = "force-dynamic";

export default async function AdminRedemptionsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/redemptions");

  const pending = await listPendingRedemptions(ctx.currentCommunityId || "");

  // Get fan details for pending redemptions
  const supabase = createAdminClient();
  const fanIds = pending.map((p) => p.fan_id);
  const { data: fans } = await supabase
    .from("fans")
    .select("id, first_name, last_name, avatar_url")
    .in("id", fanIds);

  const fanMap = new Map(fans?.map((f) => [f.id, f]) ?? []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Redemption Queue</h1>
        <div className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-semibold text-yellow-300">
          {pending.length} pending
        </div>
      </div>

      {pending.length > 0 ? (
        <div className="glass-card divide-y divide-white/5 rounded-2xl overflow-hidden">
          {pending.map((redemption) => {
            const fan = fanMap.get(redemption.fan_id);
            return (
              <div
                key={redemption.id}
                className="flex items-center justify-between gap-4 p-4 hover:bg-black/20"
              >
                <div className="flex items-center gap-3 flex-1">
                  {fan?.avatar_url && (
                    <div className="relative h-10 w-10 overflow-hidden rounded-full">
                      <Image
                        src={fan.avatar_url}
                        alt={fan.first_name || "Fan"}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {fan?.first_name || "Fan"} · {redemption.reward.title}
                    </p>
                    {redemption.delivery_details && (
                      <p className="mt-1 text-xs text-white/60">{redemption.delivery_details}</p>
                    )}
                    <p className="mt-1 text-xs text-white/50">
                      {new Date(redemption.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <RedemptionAction
                  redemptionId={redemption.id}
                  fanId={redemption.fan_id}
                  pointCost={redemption.point_cost}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-8 text-center">
          <p className="text-white/60">No pending redemptions. You&apos;re all caught up!</p>
        </div>
      )}
    </div>
  );
}
