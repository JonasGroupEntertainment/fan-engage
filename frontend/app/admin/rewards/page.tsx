import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { notFound, redirect } from "next/navigation";
import { toggleRewardActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminRewardsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login?next=/admin/rewards");

  const supabase = createAdminClient();

  // Get rewards for this community, including global rewards (community_id null)
  const { data: rewards } = await supabase
    .from("rewards_catalog")
    .select("*")
    .or(`community_id.eq.${ctx.currentCommunityId || ""},community_id.is.null`)
    .order("sort_order", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rewards Catalog</h1>
        <Link
          href="/admin/rewards/new"
          className="rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          New Reward
        </Link>
      </div>

      {rewards && rewards.length > 0 ? (
        <div className="glass-card overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead className="border-b border-white/10 bg-black/30">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Title</th>
                <th className="px-4 py-3 text-left font-semibold">Cost</th>
                <th className="px-4 py-3 text-left font-semibold">Kind</th>
                <th className="px-4 py-3 text-left font-semibold">Stock</th>
                <th className="px-4 py-3 text-left font-semibold">Active</th>
                <th className="px-4 py-3 text-left font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {rewards.map((reward: any) => (
                <tr key={reward.id} className="hover:bg-black/20">
                  <td className="px-4 py-3">{reward.title}</td>
                  <td className="px-4 py-3">{reward.point_cost.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-blue-500/20 px-2 py-1 text-xs text-blue-300">
                      {reward.kind}
                    </span>
                  </td>
                  <td className="px-4 py-3">{reward.stock ?? "∞"}</td>
                  <td className="px-4 py-3">
                    <form action={async () => { "use server"; await toggleRewardActiveAction(reward.id, reward.active); }}>
                      <button
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          reward.active
                            ? "bg-green-500/20 text-green-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {reward.active ? "Active" : "Inactive"}
                      </button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/rewards/${reward.id}`}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card rounded-2xl p-8 text-center">
          <p className="text-white/60">No rewards yet. Create one to get started.</p>
        </div>
      )}
    </div>
  );
}
