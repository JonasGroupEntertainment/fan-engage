import { createAdminClient } from "@/lib/supabase/admin";
import { requirePortalPage } from "@/lib/artist-portal/access";
import EventsClient from "./events-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events · Artist Portal" };

export default async function ArtistPortalEventsPage() {
  // Events is a management surface: editor and above.
  const ctx = await requirePortalPage("events", "/artist-portal/events");
  const communityId = ctx.communityId;

  // Service role: artist_events RLS only exposes active rows publicly, and
  // the portal needs to list inactive ones too. Access is gated above.
  const supabase = createAdminClient();

  const { data: events } = await supabase
    .from("artist_events")
    .select("id, title, detail, event_date, starts_at, location, url, capacity, sort_order, active")
    .eq("community_id", communityId)
    .order("starts_at", { ascending: true });

  const eventIds = (events ?? []).map((e) => e.id as string);
  const rsvpCounts: Record<string, number> = {};
  if (eventIds.length > 0) {
    const { data: rsvps } = await supabase
      .from("event_rsvps")
      .select("event_id")
      .in("event_id", eventIds);
    for (const r of rsvps ?? []) {
      const id = r.event_id as string;
      rsvpCounts[id] = (rsvpCounts[id] ?? 0) + 1;
    }
  }

  return (
    <EventsClient
      events={(events ?? []) as Parameters<typeof EventsClient>[0]["events"]}
      rsvpCounts={rsvpCounts}
      artistSlug={communityId}
    />
  );
}
