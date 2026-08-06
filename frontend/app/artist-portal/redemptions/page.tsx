import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import RedemptionRow from "./redemption-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Redemptions · Artist Portal" };

export default async function ArtistPortalRedemptionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/artist-portal/redemptions");

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("community_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!adminRow) redirect("/artist-portal");

  const communityId = adminRow.community_id as string;
  const admin = createAdminClient();

  const { data: redemptions } = await admin
    .from("reward_redemptions")
    .select("id, fan_id, point_cost, status, delivery_details, created_at, fulfillment_note, rewards(title)")
    .eq("community_id", communityId)
    .in("status", ["pending", "fulfilled"])
    .order("created_at", { ascending: false })
    .limit(50);

  const fanIds = [...new Set((redemptions ?? []).map((r) => r.fan_id as string))];
  let fanMap: Record<string, { first_name: string | null }> = {};
  if (fanIds.length > 0) {
    const { data: fans } = await admin
      .from("fans")
      .select("id, first_name")
      .in("id", fanIds);
    fanMap = Object.fromEntries((fans ?? []).map((f) => [f.id, f]));
  }

  const pending = (redemptions ?? []).filter((r) => r.status === "pending");
  const fulfilled = (redemptions ?? []).filter((r) => r.status === "fulfilled");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
            Redemptions
          </h1>
          <p className="mt-1 text-sm text-white/50">Fulfill or cancel fan reward requests.</p>
        </div>
        {pending.length > 0 && (
          <span className="rounded-full bg-yellow-500/20 px-3 py-1 text-xs font-semibold text-yellow-300">
            {pending.length} pending
          </span>
        )}
      </div>

      {pending.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/20 py-12 text-center text-white/50">
          No pending redemptions — you&apos;re all caught up!
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-white/50">Pending</p>
          {pending.map((r) => (
            <RedemptionRow
              key={r.id as string}
              redemption={r as unknown as Parameters<typeof RedemptionRow>[0]["redemption"]}
              fanName={fanMap[r.fan_id as string]?.first_name ?? "Fan"}
            />
          ))}
        </div>
      )}

      {fulfilled.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wide text-white/50">Recently fulfilled</p>
          {fulfilled.map((r) => (
            <RedemptionRow
              key={r.id as string}
              redemption={r as unknown as Parameters<typeof RedemptionRow>[0]["redemption"]}
              fanName={fanMap[r.fan_id as string]?.first_name ?? "Fan"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
