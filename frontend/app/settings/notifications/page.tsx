import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPreferences } from "@/lib/notifications/preferences";
import NotificationPreferencesForm from "@/components/notification-preferences-form";
import { pointsToGold } from "@/lib/tier-thresholds";

const TIER_RANK: Record<string, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
  founder: 3,
};

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const prefs = await getPreferences(user.id);

  // Determine SMS gate
  const { data: fan } = await supabase
    .from("fans")
    .select("current_tier, total_points")
    .eq("id", user.id)
    .maybeSingle();
  const tier = (fan?.current_tier as string) ?? "bronze";
  const smsAllowed = (TIER_RANK[tier] ?? 0) >= TIER_RANK.gold;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <p className="text-xs uppercase tracking-[0.25em] text-white/55">
          Settings
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-white">
          Notifications
        </h1>
        <p className="mt-2 text-sm text-white/65">
          Control what we send you and when. Push opt-in is also handled by
          your browser; if you turn it off here we stop sending immediately.
        </p>
      </header>

      <NotificationPreferencesForm
        initial={prefs}
        smsAllowed={smsAllowed}
        smsCopy={
          smsAllowed
            ? undefined
            : `Reach Gold tier (${pointsToGold(Number(fan?.total_points) || 0)} pts to go) to unlock SMS alerts.`
        }
      />
    </div>
  );
}
