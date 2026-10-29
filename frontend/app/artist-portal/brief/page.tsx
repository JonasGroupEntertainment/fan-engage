import Link from "next/link";
import { requirePortalPage } from "@/lib/artist-portal/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { teamBriefDeps } from "@/lib/team-brief/data";
import { buildArtistBrief } from "@/lib/team-brief/send";
import { briefRangeLabel } from "@/lib/team-brief/render";
import { thankScoreLegend } from "@/lib/superfans/to-thank";

export const dynamic = "force-dynamic";

/**
 * /artist-portal/brief — last week's numbers, the same ones the Monday
 * team brief emails (lib/team-brief/gather.ts). Rendered on demand from
 * live rows; nothing is sent or logged from here.
 */
export default async function BriefPage() {
  const ctx = await requirePortalPage("brief", "/artist-portal/brief");
  const admin = createAdminClient();
  const { data: community } = await admin
    .from("communities")
    .select("slug, display_name")
    .eq("slug", ctx.communityId)
    .maybeSingle();
  const displayName = (community?.display_name as string | null) ?? ctx.communityId;

  const now = new Date();
  const brief = await buildArtistBrief(teamBriefDeps(admin), { slug: ctx.communityId, displayName }, now);
  const s = brief.stats;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
            Monday brief
          </h1>
          <p className="mt-1 text-sm text-white/60">
            Last week for {displayName} · {briefRangeLabel(brief.period)}. The same numbers your
            team gets by email every Monday morning
            {brief.teamSize > 0 ? ` (${brief.teamSize} on the team)` : ""}.
          </p>
        </div>
        <Link
          href="/artist-portal/superfans"
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/80 hover:border-white/30 hover:text-white"
        >
          Superfans to thank →
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="New followers" value={s.newFollowers} />
        <Stat label="Posts by fans" value={s.postsByFans} />
        <Stat label="Posts by team" value={s.postsByTeam} />
        <Stat label="Comments" value={s.comments} />
        <Stat label="Reactions" value={s.reactions} />
        <Stat label="Check-ins" value={s.checkins} />
        <Stat label="RSVPs" value={s.rsvps} />
        <Stat label="Redemptions" value={s.redemptions} />
        <Stat label="Points awarded" value={s.pointsAwarded} />
        <Stat label="Fans active" value={s.activeFans} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Top fans by points this week">
          {brief.topFans.length === 0 ? (
            <Empty>No points were earned last week.</Empty>
          ) : (
            <ul className="divide-y divide-white/5">
              {brief.topFans.map((f, i) => (
                <li key={f.fanId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="w-5 text-right text-white/40">{i + 1}</span>
                    <FanName name={f.name} profilePath={f.profilePath} />
                    {f.tier && <TierBadge tier={f.tier} />}
                  </span>
                  <span className="font-semibold text-white">{f.points.toLocaleString()} pts</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Superfans to thank">
          {brief.superfansToThank.length === 0 ? (
            <Empty>Nobody new — everyone active lately has been thanked recently.</Empty>
          ) : (
            <ul className="divide-y divide-white/5">
              {brief.superfansToThank.map((f) => (
                <li key={f.fanId} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex items-center gap-3">
                    <FanName name={f.name} profilePath={f.profilePath} />
                    {f.tier && <TierBadge tier={f.tier} />}
                    {f.daysSinceActivity != null && (
                      <span className="text-xs text-white/40">
                        active {f.daysSinceActivity === 0 ? "today" : `${f.daysSinceActivity}d ago`}
                      </span>
                    )}
                  </span>
                  <span className="text-white/70">score {f.score}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-white/40">Score: {thankScoreLegend()}.</p>
        </Section>

        <Section title="Upcoming events (next 14 days)">
          {brief.upcomingEvents.length === 0 ? (
            <Empty>Nothing scheduled.</Empty>
          ) : (
            <ul className="divide-y divide-white/5">
              {brief.upcomingEvents.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>
                    <span className="mr-3 text-white/50">{e.day ?? e.when ?? "TBA"}</span>
                    <span className="text-white">{e.title}</span>
                  </span>
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" className="text-xs text-white/60 hover:text-white">
                      Link ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Waiting on you">
          {brief.pendingDrafts > 0 ? (
            <p className="text-sm text-white/80">
              {brief.pendingDrafts} AI post draft{brief.pendingDrafts === 1 ? "" : "s"} waiting for review.{" "}
              <Link href="/artist-portal/community" className="underline hover:text-white">
                Review
              </Link>
            </p>
          ) : (
            <Empty>No AI drafts waiting.</Empty>
          )}
        </Section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-white/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value.toLocaleString()}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-white/50">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-white/50">{children}</p>;
}

function FanName({ name, profilePath }: { name: string; profilePath: string | null }) {
  if (!profilePath) return <span className="text-white">{name}</span>;
  return (
    <Link href={profilePath} className="text-white underline-offset-2 hover:underline">
      {name}
    </Link>
  );
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/60">
      {tier}
    </span>
  );
}
