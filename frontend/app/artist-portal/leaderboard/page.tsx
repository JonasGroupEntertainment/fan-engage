import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboard · Artist Portal" };

export default async function ArtistPortalLeaderboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/artist-portal/leaderboard");

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("community_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!adminRow) redirect("/artist-portal");

  const communityId = adminRow.community_id as string;
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("fan_community_memberships")
    .select("fan_id, total_points, current_tier, joined_at, fans(first_name, avatar_url)")
    .eq("community_id", communityId)
    .eq("status", "active")
    .order("total_points", { ascending: false })
    .limit(50);

  const tierColor: Record<string, string> = {
    founder: "text-amber-300",
    premium: "text-purple-300",
    free: "text-white/50",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white" style={{ fontFamily: "var(--font-display)" }}>
          Leaderboard
        </h1>
        <p className="mt-1 text-sm text-white/50">
          Top {members?.length ?? 0} fans ranked by points.
        </p>
      </div>

      {(!members || members.length === 0) && (
        <div className="rounded-2xl border border-white/10 bg-black/20 py-16 text-center text-white/50">
          No fans yet.
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
        {(members ?? []).map((m, i) => {
          const fan = (m.fans as unknown) as { first_name: string | null; avatar_url: string | null } | null;
          const tier = (m.current_tier as string) ?? "free";
          return (
            <div
              key={m.fan_id as string}
              className="flex items-center gap-4 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5"
            >
              <span className={`w-7 text-sm font-bold text-center ${i < 3 ? "text-amber-300" : "text-white/30"}`}>
                {i + 1}
              </span>
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-aurora/40 to-ember/40 text-sm font-bold text-white">
                {fan?.first_name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {fan?.first_name ?? "Fan"}
                </p>
                <p className={`text-xs capitalize ${tierColor[tier] ?? "text-white/50"}`}>
                  {tier}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">
                  {(m.total_points as number ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-white/50">pts</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
