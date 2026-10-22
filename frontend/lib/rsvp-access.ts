import { getAdminContext } from "@/lib/admin";
import { roleAtLeast } from "@/lib/admin-authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { selectWithOptionalRsvpOpens } from "@/lib/data/event-select";
import { grantManagesEventRsvps, type RsvpAdminGrant } from "@/lib/rsvp-window";

/**
 * Founding Fan number for the signed-in viewer in one community.
 * Null when signed out or when no number has been awarded.
 * Callers must pass this through `isFoundingFanNumber`.
 */
export async function viewerFoundingFanNumber(communityId: string): Promise<number | null> {
  if (!communityId) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const admin = createAdminClient();
    const { data } = await admin
      .from("fan_community_memberships")
      .select("founding_fan_number")
      .eq("fan_id", user.id)
      .eq("community_id", communityId)
      .maybeSingle();
    const n = data?.founding_fan_number;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

/** Editor+ for this artist, a `*` super-admin, or the ADMIN_EMAILS fallback. */
export async function viewerManagesEventRsvps(artistSlug: string): Promise<boolean> {
  if (!artistSlug) return false;
  try {
    const ctx = await getAdminContext();
    if (!ctx) return false;
    if (ctx.isSuperAdmin && roleAtLeast(ctx.role, "editor")) return true;
    const admin = createAdminClient();
    const { data } = await admin
      .from("admin_users")
      .select("community_id, role")
      .eq("user_id", ctx.user.id)
      .in("community_id", [artistSlug, "*"]);
    const grants: RsvpAdminGrant[] = (data ?? []).map((row) => ({
      communityId: row.community_id as string,
      role: (row.role as string | null) ?? null,
    }));
    return grantManagesEventRsvps(grants, artistSlug);
  } catch {
    return false;
  }
}

export type EventRsvpSchedule = {
  artistSlug: string;
  rsvpOpensAt: string | null;
};

/** Load the event's artist and public RSVP open time. Missing column = open now. */
export async function loadEventRsvpSchedule(
  eventId: string,
): Promise<{ ok: true; schedule: EventRsvpSchedule } | { ok: false; error: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await selectWithOptionalRsvpOpens(
      (columns) =>
        admin.from("artist_events").select(columns).eq("id", eventId).maybeSingle(),
      "id, artist_slug",
    );
    if (error || !data) return { ok: false, error: "Missing event" };
    const row = data as {
      artist_slug?: string | null;
      rsvp_opens_at?: string | null;
    };
    const artistSlug = row.artist_slug ?? "";
    if (!artistSlug) return { ok: false, error: "Missing event" };
    return {
      ok: true,
      schedule: {
        artistSlug,
        rsvpOpensAt: row.rsvp_opens_at ?? null,
      },
    };
  } catch {
    return { ok: false, error: "Couldn't RSVP (try again in a moment)" };
  }
}
