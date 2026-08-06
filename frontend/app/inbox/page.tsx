import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listNotifications, type Notification } from "@/lib/data/notifications";
import { relativeTime } from "@/lib/format/relative-time";
import {
  archiveReadAction,
  markAllReadAction,
  markNotificationReadAction,
} from "./actions";

export const metadata = { title: "Inbox" };

export const dynamic = "force-dynamic";

function kindLabel(kind: string): string {
  switch (kind) {
    case "badge_earned":
      return "Badge";
    case "rsvp_confirmed":
      return "Event";
    case "referral_joined":
      return "Referral";
    case "challenge_approved":
      return "Challenge";
    case "campaign":
      return "News";
    default:
      return kind.replace(/_/g, " ");
  }
}

function fallbackIcon(kind: string): string {
  switch (kind) {
    case "badge_earned":
      return "🏅";
    case "rsvp_confirmed":
      return "🎟️";
    case "referral_joined":
      return "🤝";
    case "challenge_approved":
      return "🏆";
    case "campaign":
      return "📣";
    default:
      return "🔔";
  }
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: Promise<{ filter?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/inbox");

  const params = (await searchParams) ?? {};
  const filter = params.filter === "unread" ? "unread" : "all";

  const all = await listNotifications(100);
  const items: Notification[] = filter === "unread" ? all.filter((n) => !n.read_at) : all;
  const unreadCount = all.filter((n) => !n.read_at).length;


  // Group by kind for the section view (M-10).
  const groupedKinds = new Map<string, typeof items>();
  for (const n of items) {
    const k = kindLabel(n.kind);
    if (!groupedKinds.has(k)) groupedKinds.set(k, []);
    groupedKinds.get(k)!.push(n);
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/50">Notifications</p>
          <h1
            className="mt-1 text-3xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Inbox
          </h1>
          <p className="mt-1 text-sm text-white/60">
            {unreadCount > 0
              ? `${unreadCount} unread`
              : "You're all caught up."}
          </p>
        </div>
        {all.length > 0 && (
          <div className="flex items-center gap-2">
            <Link href="/me/notifications" className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-white/70 transition hover:border-white/20 hover:text-white">
              Preferences
            </Link>
            {unreadCount > 0 && (
              <form action={markAllReadAction}>
                <button type="submit" className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/80 hover:bg-white/10">
                  Mark all read
                </button>
              </form>
            )}
            {all.length > unreadCount && (
              <form action={archiveReadAction}>
                <button type="submit" className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/60 hover:bg-white/10">
                  Archive read
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      <div className="mb-4 flex gap-1 text-xs">
        <Link
          href="/inbox"
          className={`rounded-full px-3 py-1.5 ${
            filter === "all"
              ? "bg-white/15 text-white"
              : "text-white/60 hover:bg-white/10 hover:text-white"
          }`}
        >
          All
        </Link>
        <Link
          href="/inbox?filter=unread"
          className={`rounded-full px-3 py-1.5 ${
            filter === "unread"
              ? "bg-white/15 text-white"
              : "text-white/60 hover:bg-white/10 hover:text-white"
          }`}
        >
          Unread
          {unreadCount > 0 && (
            <span className="ml-1 rounded-full bg-ember px-1.5 py-0.5 text-xs font-semibold text-white">
              {unreadCount}
            </span>
          )}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-white/60">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/5 text-2xl">
            🔔
          </div>
          <p className="text-sm">
            {filter === "unread"
              ? "Nothing unread. Enjoy the calm."
              : "Your notifications will show up here — new badges, RSVPs, referrals, and artist drops."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
        {Array.from(groupedKinds.entries()).map(([groupName, groupItems]) => (
          <section key={groupName}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-white/50">
              {groupName}
            </h3>
            <ul className="divide-y divide-white/10 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              {groupItems.map((n) => (
            <li key={n.id}>
              <form action={markNotificationReadAction}>
                <input type="hidden" name="id" value={n.id} />
                {n.url && (
                  <input type="hidden" name="redirect_to" value={n.url} />
                )}
                <button
                  type="submit"
                  className={`flex w-full items-start gap-4 px-4 py-4 text-left transition hover:bg-white/5 ${
                    n.read_at ? "opacity-70" : ""
                  }`}
                >
                  <div className="flex-shrink-0 rounded-full bg-white/10 p-2 text-lg leading-none">
                    {n.icon || fallbackIcon(n.kind)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs uppercase tracking-widest text-white/50">
                        {kindLabel(n.kind)}
                      </span>
                      <span className="text-xs text-white/50">
                        · {relativeTime(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-white">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-white/65 line-clamp-2">
                        {n.body}
                      </p>
                    )}
                  </div>
                  {!n.read_at && (
                    <span className="mt-2 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-gradient-to-br from-aurora to-ember" />
                  )}
                </button>
              </form>
            </li>
              ))}
            </ul>
          </section>
        ))}
        </div>
      )}
    </main>
  );
}
