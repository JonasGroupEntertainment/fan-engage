import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EventsClient from "./events-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events · Artist Portal" };

export default async function ArtistPortalEventsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/artist-portal/events");

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("community_id")
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();

  if (!adminRow) redirect("/artist-portal");

  const communityId = adminRow.community_id as string;

  const { data: events } = await supabase
    .from("artist_events")
    .select("id, title, detail, event_date, starts_at, location, url, capacity, sort_order, active")
    .eq("community_id", communityId)
    .order("starts_at", { ascending: true });

  const eventIds = (events ?? []).map((e) => e.id as string);
  const rsvpCounts: Record<string, number> = {};
  if (eventIds.length > 0) {
    const { data: rsvps } = await supabase
      .from("fan_event_rsvps")
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
