import Link from "next/link";
import { requirePortalPage, roleAtLeast, PORTAL_MIN_ROLE } from "@/lib/artist-portal/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamBriefDeps } from "@/lib/team-brief/data";
import { buildArtistBrief } from "@/lib/team-brief/send";
import {
  THANK_COOLDOWN_DAYS,
  THANK_WINDOW_DAYS,
  thankScoreLegend,
  thankYouTemplate,
} from "@/lib/superfans/to-thank";
import SuperfanRowActions from "./superfan-row-actions";

export const dynamic = "force-dynamic";

const PAGE_LIMIT = 25;

/**
 * /artist-portal/superfans — the fans most worth a personal thank-you
 * (lib/superfans/to-thank.ts over the last 30 days), with the tier they
 * hold in this community, the score breakdown, a copy-ready template, and
 * "Mark thanked" (editor+) which writes superfan_thanks (0095) and keeps
 * them off the list for 60 days.
 *
 * Tier is fan_community_memberships.current_tier. Super Fan Radar's
 * CANDIDATE / CORE / ELITE tiers live in the sister project keyed by
 * social username + platform, not by fans.id, so they cannot be joined to
 * a Fan Engage fan here (see app/admin/super-fans for the per-community
 * roll-up).
 */
export default async function SuperfansPage() {
  const ctx = await requirePortalPage("superfans", "/artist-portal/superfans");
  const canThank = roleAtLeast(ctx.role, PORTAL_MIN_ROLE.superfansThank);

  const admin = createAdminClient();
  const { data: community } = await admin
    .from("communities")
    .select("slug, display_name")
    .eq("slug", ctx.communityId)
    .maybeSingle();
  const artistName = (community?.display_name as string | null) ?? ctx.communityId;

  const brief = await buildArtistBrief(
    teamBriefDeps(admin),
    { slug: ctx.communityId, displayName: artistName },
    new Date(),
    { thankLimit: PAGE_LIMIT },
  );
  const fans = brief.superfansToThank;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Superfans to thank
          </h1>
          <p className="mt-1 text-sm text-white/60">
            The fans who showed up most for {artistName} in the last {THANK_WINDOW_DAYS} days
            and have not been thanked in the last {THANK_COOLDOWN_DAYS}. Copy the note, send it
            where they will see it, then mark them thanked.
          </p>
        </div>
        <Link
          href="/artist-portal/brief"
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:border-white/30 hover:text-white"
        >
          ← Monday brief
        </Link>
      </div>

      {fans.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/40 px-6 py-10 text-center">
          <p className="text-sm text-white/70">
            Nobody new right now — everyone active lately has been thanked in the last{" "}
            {THANK_COOLDOWN_DAYS} days, or nothing has happened yet.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/50">
                <th className="px-4 py-3">Fan</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Last active</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {fans.map((f) => (
                <tr key={f.fanId} className="border-b border-white/5 align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">
                      {f.profilePath ? (
                        <Link href={f.profilePath} className="underline-offset-2 hover:underline">
                          {f.name}
                        </Link>
                      ) : (
                        f.name
                      )}
                      {f.tier && (
                        <span className="ml-2 rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
                          {f.tier}
                        </span>
                      )}
                    </p>
                    {!f.profilePath && (
                      <p className="text-xs text-white/40">profile not public</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-white">{f.score}</p>
                    <p className="mt-1 text-xs text-white/50">
                      {breakdownLine(f.breakdown, f)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {f.daysSinceActivity == null
                      ? "—"
                      : f.daysSinceActivity === 0
                        ? "today"
                        : `${f.daysSinceActivity} day${f.daysSinceActivity === 1 ? "" : "s"} ago`}
                  </td>
                  <td className="px-4 py-3">
                    <SuperfanRowActions
                      fanId={f.fanId}
                      canThank={canThank}
                      template={thankYouTemplate({ fanName: f.name, artistName })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-white/40">
        Score: {thankScoreLegend()}. Internal accounts and your own team never appear.
        {!canThank && " Marking a fan thanked needs the editor role or above."}
      </p>
    </div>
  );
}

function breakdownLine(
  b: { checkins: number; rsvps: number; comments: number; redemptions: number; reactions: number; points: number },
  counts: { checkins: number; rsvps: number; comments: number; redemptions: number; reactions: number; pointsEarned: number },
): string {
  const parts: string[] = [];
  if (counts.checkins) parts.push(`${counts.checkins} check-in${counts.checkins === 1 ? "" : "s"} (+${b.checkins})`);
  if (counts.rsvps) parts.push(`${counts.rsvps} RSVP${counts.rsvps === 1 ? "" : "s"} (+${b.rsvps})`);
  if (counts.comments) parts.push(`${counts.comments} comment${counts.comments === 1 ? "" : "s"} (+${b.comments})`);
  if (counts.redemptions) parts.push(`${counts.redemptions} redemption${counts.redemptions === 1 ? "" : "s"} (+${b.redemptions})`);
  if (counts.reactions) parts.push(`${counts.reactions} reaction${counts.reactions === 1 ? "" : "s"} (+${b.reactions})`);
  if (counts.pointsEarned) parts.push(`${counts.pointsEarned.toLocaleString()} pts earned (+${b.points})`);
  return parts.join(" · ");
}
