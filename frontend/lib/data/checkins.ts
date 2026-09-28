import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { awardPoints } from "@/lib/points/award";
import { easternDateString } from "@/lib/dates/eastern";

const CHECKIN_POINTS = 25;

const todayET = (): string => easternDateString();

export async function recordCheckin(
  fanId: string,
  artistSlug: string,
): Promise<{ alreadyCheckedIn: boolean; pointsAwarded: number }> {
  const admin = createAdminClient();
  const today = todayET();
  const sourceRef = `checkin:${artistSlug}:${fanId}:${today}`;

  const { data: existing } = await admin
    .from("checkins")
    .select("id")
    .eq("fan_id", fanId)
    .eq("artist_slug", artistSlug)
    .gte("created_at", `${today}T00:00:00-05:00`)
    .maybeSingle();

  if (existing) return { alreadyCheckedIn: true, pointsAwarded: 0 };

  await admin.from("checkins").insert({
    fan_id: fanId,
    artist_slug: artistSlug,
    points_awarded: CHECKIN_POINTS,
  });

  await awardPoints(admin, {
    fanId,
    delta: CHECKIN_POINTS,
    source: "daily_checkin",
    sourceRef,
    note: `Daily check-in at ${artistSlug}`,
    communityId: artistSlug,
  });

  return { alreadyCheckedIn: false, pointsAwarded: CHECKIN_POINTS };
}

export async function getFanCheckinCount(
  fanId: string,
  artistSlug: string,
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("checkins")
    .select("id", { count: "exact", head: true })
    .eq("fan_id", fanId)
    .eq("artist_slug", artistSlug);
  return count ?? 0;
}

export async function getArtistCheckinsToday(artistSlug: string): Promise<number> {
  const admin = createAdminClient();
  const today = todayET();
  const { count } = await admin
    .from("checkins")
    .select("id", { count: "exact", head: true })
    .eq("artist_slug", artistSlug)
    .gte("created_at", `${today}T00:00:00-05:00`);
  return count ?? 0;
}
