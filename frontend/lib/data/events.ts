import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { selectWithOptionalRsvpOpens } from "@/lib/data/event-select";

export interface EventRow {
  id: string;
  artist_slug: string;
  title: string;
  detail: string | null;
  event_date: string | null;
  url: string | null;
  location: string | null;
  image_url: string | null;
  capacity: number | null;
  starts_at: string | null;
  ends_at: string | null;
  sort_order: number;
  active: boolean;
  /** Migration 0078. Null or absent means RSVP is open now. */
  rsvp_opens_at?: string | null;
}

/** Single event with RSVP count + whether the current fan has RSVPed. */
export interface EventWithRsvp extends EventRow {
  rsvp_count: number;
  rsvp_by_me: boolean;
  artist_name?: string | null;
}

export async function getEventById(eventId: string): Promise<EventWithRsvp | null> {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const [{ data: event }, { count }] = await Promise.all([
      selectWithOptionalRsvpOpens(
        (columns) =>
          supabase.from("artist_events").select(columns).eq("id", eventId).maybeSingle(),
        "id, artist_slug, title, detail, event_date, url, location, image_url, capacity, starts_at, ends_at, sort_order, active",
      ),
      admin
        .from("event_rsvps")
        .select("event_id", { count: "exact", head: true })
        .eq("event_id", eventId),
    ]);
    if (!event) return null;
    const eventRow = event as unknown as EventRow;

    const [{ data: artist }, {
      data: { user },
    }] = await Promise.all([
      supabase
        .from("artists")
        .select("name")
        .eq("slug", eventRow.artist_slug)
        .maybeSingle(),
      supabase.auth.getUser(),
    ]);

    let rsvpByMe = false;
    if (user) {
      const { data } = await supabase
        .from("event_rsvps")
        .select("event_id")
        .eq("event_id", eventId)
        .eq("fan_id", user.id)
        .maybeSingle();
      rsvpByMe = data !== null;
    }

    return {
      ...eventRow,
      rsvp_count: count ?? 0,
      rsvp_by_me: rsvpByMe,
      artist_name: (artist?.name as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** RSVP counts + fan's own RSVP status for a set of events (artist page). */
export async function getRsvpMetaForEvents(eventIds: string[]): Promise<{
  counts: Map<string, number>;
  mine: Set<string>;
}> {
  const counts = new Map<string, number>();
  const mine = new Set<string>();
  if (eventIds.length === 0) return { counts, mine };

  try {
    const admin = createAdminClient();
    const supabase = await createClient();

    const [{ data: rows }, meRes] = await Promise.all([
      admin.from("event_rsvps").select("event_id").in("event_id", eventIds),
      (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { data: [] as { event_id: string }[] };
        return admin
          .from("event_rsvps")
          .select("event_id")
          .in("event_id", eventIds)
          .eq("fan_id", user.id);
      })(),
    ]);

    for (const r of rows ?? []) {
      const eid = r.event_id as string;
      counts.set(eid, (counts.get(eid) ?? 0) + 1);
    }
    for (const r of (meRes.data ?? []) as { event_id: string }[]) {
      mine.add(r.event_id);
    }
  } catch {
    /* fall through with empty maps */
  }
  return { counts, mine };
}

/** Admin-scoped: list every RSVP for an event with fan info. */
export async function listRsvpsForEvent(eventId: string) {
  const admin = createAdminClient();
  const { data: rsvps } = await admin
    .from("event_rsvps")
    .select("fan_id, rsvp_at")
    .eq("event_id", eventId)
    .order("rsvp_at", { ascending: false });
  if (!rsvps || rsvps.length === 0) return [];

  const fanIds = rsvps.map((r) => r.fan_id as string);
  const { data: fans } = await admin
    .from("fans")
    .select("id, first_name, email, avatar_url")
    .in("id", fanIds);
  const byId = new Map((fans ?? []).map((f) => [f.id as string, f]));
  return rsvps.map((r) => ({
    fan_id: r.fan_id as string,
    rsvp_at: r.rsvp_at as string,
    fan: byId.get(r.fan_id as string) ?? null,
  }));
}

/** Generate an iCalendar VEVENT payload for an event. */
export function buildIcs(event: EventRow & { artist_name?: string | null }): string {
  const now = new Date();
  const dtstamp = icsDate(now);
  const uid = `${event.id}@fan-engage.app`;

  // Prefer starts_at if set; otherwise fall back to event_date treated as
  // a free-form string so the calendar still has useful context.
  const start = event.starts_at ? new Date(event.starts_at) : null;
  const end = event.ends_at ? new Date(event.ends_at) : null;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fan Engage//Events//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
  ];
  if (start) {
    lines.push(`DTSTART:${icsDate(start)}`);
    lines.push(`DTEND:${icsDate(end ?? addHours(start, 2))}`);
  }
  lines.push(`SUMMARY:${icsEscape(event.title)}`);
  if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
  const description = [
    event.artist_name ? `${event.artist_name}` : null,
    event.detail ?? null,
    event.url ? `More info: ${event.url}` : null,
    !start && event.event_date ? `When: ${event.event_date}` : null,
  ]
    .filter(Boolean)
    .join("\\n");
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n");
}

function icsDate(d: Date): string {
  // Basic UTC format: 20260415T200000Z
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}
function addHours(d: Date, h: number): Date {
  return new Date(d.getTime() + h * 60 * 60 * 1000);
}
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
