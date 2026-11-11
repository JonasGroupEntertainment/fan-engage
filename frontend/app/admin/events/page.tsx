import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminCommunityId } from "@/lib/admin";
import { authorizeAdmin } from "@/lib/admin-guard";
import PendingSubmitButton from "@/components/pending-submit-button";
import LocalDateTimeField from "@/components/local-datetime-field";
import { EASTERN_TIME_ZONE } from "@/lib/dates/eastern";
import { addEventAction, removeEventAction } from "./actions";

export const dynamic = "force-dynamic";

type EventRow = {
  id: string;
  title: string;
  detail: string | null;
  event_date: string | null;
  starts_at: string | null;
  location: string | null;
  url: string | null;
  capacity: number | null;
  active: boolean;
};

const INPUT_CLASS =
  "w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none";

/**
 * This page renders on the server, which has no idea of the admin's time
 * zone, so a bare toLocaleString() printed UTC. Show Eastern, the zone fans
 * see times in, and say so.
 */
function whenLabel(event: EventRow): string {
  if (!event.starts_at) return event.event_date ?? "Date to be announced";
  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) return event.event_date ?? "Date to be announced";
  const text = start.toLocaleString("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${text} ET`;
}

export default async function EventsAdminPage() {
  const artistSlug = await getAdminCommunityId();
  const guard = await authorizeAdmin({ communityId: artistSlug, minRole: "admin" });
  if (!guard.ok) {
    redirect(guard.reason === "signed_out" ? "/login?next=/admin/events" : "/admin");
  }

  const { data, error } = await createAdminClient()
    .from("artist_events")
    .select("id, title, detail, event_date, starts_at, location, url, capacity, active")
    .eq("artist_slug", artistSlug)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });
  if (error) console.warn("events load error:", error.message);
  const events = (data ?? []) as EventRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Events
        </h1>
        <p className="mt-2 text-sm text-white/60">
          Add events for your fans. New events show on the artist page right away.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
        <h2 className="text-sm uppercase tracking-wide text-white/60">Add an event</h2>
        <form action={addEventAction} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-white/60">Title</span>
            <input type="text" name="title" required placeholder="Fan meet and greet" className={INPUT_CLASS} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-white/60">Starts, your local time (optional)</span>
            <LocalDateTimeField name="starts_at" className={INPUT_CLASS} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-white/60">Date text (optional)</span>
            <input type="text" name="event_date" placeholder="Coming soon" className={INPUT_CLASS} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-white/60">Location (optional)</span>
            <input type="text" name="location" placeholder="Venue, City" className={INPUT_CLASS} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-white/60">Capacity (optional)</span>
            <input type="number" name="capacity" min={1} placeholder="50" className={INPUT_CLASS} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-white/60">Link (optional)</span>
            <input type="url" name="url" placeholder="https://" className={INPUT_CLASS} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1 block text-xs text-white/60">Details (optional)</span>
            <textarea name="detail" rows={3} className={INPUT_CLASS} />
          </label>
          <div className="sm:col-span-2">
            <PendingSubmitButton
              pendingLabel="Adding…"
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
            >
              Add event
            </PendingSubmitButton>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        {events.length === 0 && (
          <p className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/50">
            No events yet. Add your first one above.
          </p>
        )}
        {events.map((event) => (
          <div key={event.id} className="rounded-2xl border border-white/10 bg-black/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{event.title}</h3>
                <p className="mt-0.5 text-xs text-white/60">
                  {whenLabel(event)}
                  {event.location ? ` · ${event.location}` : ""}
                  {event.capacity ? ` · ${event.capacity} spots` : ""}
                </p>
                {event.detail && <p className="mt-2 text-sm text-white/80">{event.detail}</p>}
              </div>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  event.active ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/50"
                }`}
              >
                {event.active ? "ACTIVE" : "HIDDEN"}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-3">
              <Link href={`/admin/artists/${artistSlug}`} className="text-xs text-white/60 hover:text-white">
                Edit, reminders and RSVPs →
              </Link>
              <form action={removeEventAction} className="ml-auto">
                <input type="hidden" name="event_id" value={event.id} />
                <PendingSubmitButton
                  pendingLabel="Removing…"
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10 disabled:opacity-60"
                >
                  Remove
                </PendingSubmitButton>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
