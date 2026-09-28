import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { smsTierAllowed } from "@/lib/sms-send-gate";
import { pointsToGold } from "@/lib/tier-thresholds";
import { PreferencesForm } from "./preferences-form";
import { DEFAULT_PREFS, TOGGLE_KEYS, type Prefs } from "./prefs";

export const metadata = { title: "Notifications" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PREFS_SELECT = [...TOGGLE_KEYS, "quiet_start", "quiet_end"].join(", ");

// Postgres time comes back as 'HH:MM:SS'; <input type="time"> wants 'HH:MM'.
function toHhMm(value: unknown): string | null {
  return typeof value === "string" && value.length >= 5 ? value.slice(0, 5) : null;
}

export default async function NotificationPreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/notifications");

  const [{ data: row }, { data: pushSubs }, { data: fan }] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select(PREFS_SELECT)
      .eq("fan_id", user.id)
      .maybeSingle(),
    supabase
      .from("push_subscriptions")
      .select("endpoint")
      .eq("fan_id", user.id)
      .limit(1),
    supabase
      .from("fans")
      .select("phone, current_tier, total_points")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const stored = row as Partial<Record<string, unknown>> | null;
  const prefs: Prefs = stored
    ? {
        ...DEFAULT_PREFS,
        ...(stored as Partial<Prefs>),
        quiet_start: toHhMm(stored.quiet_start),
        quiet_end: toHhMm(stored.quiet_end),
      }
    : DEFAULT_PREFS;

  const hasPush = !!(pushSubs && pushSubs.length > 0);
  const hasEmail = !!user.email;
  const hasSms = !!fan?.phone;

  const smsAllowed = smsTierAllowed(fan?.current_tier as string | null);
  const smsCopy = `Reach Gold tier (${pointsToGold(
    Number(fan?.total_points) || 0,
  )} pts to go) to unlock SMS alerts.`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
      <nav className="mb-6 text-sm">
        <Link href="/inbox" className="text-white/50 hover:text-white">
          ← Inbox
        </Link>
      </nav>

      <header className="mb-8">
        <p className="text-xs uppercase tracking-widest text-white/60">
          Notifications
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Notification preferences
        </h1>
        <p className="mt-3 text-white/70">
          Choose what we ping you about. Channel availability:
          <span className="ml-2 inline-flex flex-wrap gap-2">
            <ChannelChip label="Push" available={hasPush} />
            <ChannelChip label="SMS" available={hasSms} />
            <ChannelChip label="Email" available={hasEmail} />
          </span>
        </p>
      </header>

      <PreferencesForm
        initial={prefs}
        hadRow={!!stored}
        smsAllowed={smsAllowed}
        smsCopy={smsCopy}
      />

      <p className="mt-8 text-xs text-white/50">
        We never sell your data. You can unsubscribe from emails at any
        time via the link at the bottom of any email.
      </p>
    </main>
  );
}

function ChannelChip({
  label,
  available,
}: {
  label: string;
  available: boolean;
}) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs " +
        (available
          ? "border-emerald-400/30 text-emerald-300"
          : "border-white/10 text-white/50")
      }
      title={available ? `${label} is set up` : `${label} is not set up`}
    >
      {label} · {available ? "on" : "off"}
    </span>
  );
}
