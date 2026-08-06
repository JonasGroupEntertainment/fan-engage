import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PreferencesForm, type Prefs } from "./preferences-form";

export const metadata = { title: "Notifications" };

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULTS: Prefs = {
  push_enabled: false,
  sms_enabled: false,
  notify_new_post: true,
  notify_event_match: true,
  notify_comment_on_my_post: true,
  notify_redemption: true,
  notify_drops: true,
  notify_rsvp_confirmation: true,
  notify_predictions: true,
  notify_anniversaries: true,
  notify_leaderboard: true,
  notify_weekly_digest: true,
};

export default async function NotificationPreferencesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/me/notifications");

  // Try fan_id first (FE), fall back to member_id (BEP).
  let prefs: Prefs = DEFAULTS;
  let foundRow = false;
  const select =
    "push_enabled, sms_enabled, " +
    "notify_new_post, notify_event_match, notify_comment_on_my_post, " +
    "notify_redemption, notify_drops, notify_rsvp_confirmation, " +
    "notify_predictions, notify_anniversaries, notify_leaderboard, notify_weekly_digest";
  for (const col of ["fan_id", "member_id"]) {
    const { data, error } = await supabase
      .from("notification_preferences")
      .select(select)
      .eq(col, user.id)
      .maybeSingle();
    if (!error && data) {
      prefs = { ...DEFAULTS, ...(data as Partial<Prefs>) } as Prefs;
      foundRow = true;
      break;
    }
  }

  // Channel availability hint: did the user actually wire up push/sms?
  const { data: pushSubs } = await supabase
    .from("push_subscriptions")
    .select("endpoint")
    .or(`fan_id.eq.${user.id},member_id.eq.${user.id}`)
    .limit(1);
  const hasPush = !!(pushSubs && pushSubs.length > 0);
  const hasEmail = !!user.email;

  let hasSms = false;
  for (const tbl of ["fans", "members"]) {
    const { data: r } = await supabase
      .from(tbl)
      .select("phone")
      .eq("id", user.id)
      .maybeSingle();
    if (r && (r as { phone?: string }).phone) {
      hasSms = true;
      break;
    }
  }

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

      <PreferencesForm initial={prefs} hadRow={foundRow} />

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
