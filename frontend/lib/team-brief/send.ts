import { APP_URL } from "../app-url.ts";
import {
  mandrillConfigured,
  sendMandrillBatch,
  type TransactionalBatchResult,
  type TransactionalProvider,
  type TransactionalRecipient,
} from "../email/transactional.ts";
import { TEAM_BRIEF_KIND, TEAM_BRIEF_NO_PROVIDER, TEAM_BRIEF_TAGS } from "./constants.ts";
import type { TeamBriefDeps, TeamBriefLog, TeamMember } from "./data.ts";
import { briefPeriod, gatherTeamBrief, type TeamBriefData } from "./gather.ts";
import { renderTeamBrief, type TeamBriefContent } from "./render.ts";

/**
 * The Monday team brief run. For every active artist with at least one
 * portal team member (admin_users rows on that community — super-admin '*'
 * rows are not a team), gather last week's numbers, render one email, and
 * send it to each team member who has an email on their fans row
 * (fans.id == auth.uid(), so admin_users.user_id is the fans id).
 *
 * Delivery is Mandrill only (MANDRILL_API_KEY). The Mailchimp fallback the
 * lapsed nudge uses would subscribe every team member into the fan
 * marketing audience and keys the body on the member, so a person on two
 * teams would get one brief. Without the key every artist is reported as
 * skipped with TEAM_BRIEF_NO_PROVIDER, nothing is sent, nothing is written.
 *
 * Dedup: one brief per artist per ISO week. A 'sent' notification_log row
 * (notification_type 'team_brief', metadata.week_start = this Monday,
 * metadata.community_id = slug, no metadata.test_email) for any team
 * member marks the artist done; a 'failed' row does not, so a provider
 * outage retries next invocation.
 *
 * ?dryRun=1 renders everything and sends nothing (and writes nothing).
 * ?testEmail=x sends only to that address; those rows are logged as
 * 'suppressed' (suppression_reason 'test_email') so the week's real run
 * still goes out.
 */

export type ArtistBriefOutcome = {
  slug: string;
  displayName: string;
  teamSize: number;
  /** Team members with an email (after ?testEmail filtering). */
  recipients: number;
  subject: string;
  status: "sent" | "partial" | "failed" | "skipped" | "dry-run";
  reason?: string;
  sent: number;
  failed: number;
};

export type TeamBriefRunResult = {
  provider: TransactionalProvider | null;
  weekStart: string;
  period: { start: string; end: string };
  dryRun: boolean;
  artists: ArtistBriefOutcome[];
  sent: number;
  failed: number;
  skipped: number;
  campaignId: string | null;
  error: string | null;
};

export type TeamBriefRunParams = {
  deps: TeamBriefDeps;
  dryRun: boolean;
  testEmail: string | null;
  now?: Date;
  /** Test seam; defaults to the real provider dispatch. */
  send?: (recipients: readonly TransactionalRecipient[]) => Promise<TransactionalBatchResult>;
  baseHref?: string;
  /** Test seam for the provider check. */
  env?: Record<string, string | undefined>;
};

type Prepared = {
  artist: ArtistBriefOutcome;
  members: TeamMember[];
  content: TeamBriefContent;
};

/** Build one artist's brief for the portal page — no email, no logging. */
export async function buildArtistBrief(
  deps: TeamBriefDeps,
  artist: { slug: string; displayName: string },
  now: Date = new Date(),
  opts: { thankLimit?: number } = {},
): Promise<TeamBriefData> {
  const { start, end } = briefPeriod(now);
  const team = await deps.listTeam(artist.slug);
  const raw = await deps.loadRaw(artist, team, { start, end }, now);
  return gatherTeamBrief(raw, now, opts);
}

export async function runTeamBrief(params: TeamBriefRunParams): Promise<TeamBriefRunResult> {
  const { deps, dryRun } = params;
  const now = params.now ?? new Date();
  const env = params.env ?? process.env;
  const send = params.send ?? ((r) => sendMandrillBatch(r, TEAM_BRIEF_TAGS, env));
  const providerReady = mandrillConfigured(env);
  const baseHref = params.baseHref ?? APP_URL;
  const wanted = params.testEmail?.trim().toLowerCase() || null;
  const { start, end, weekStart } = briefPeriod(now);
  const period = { start, end };

  const base: TeamBriefRunResult = {
    provider: providerReady ? "mandrill" : null,
    weekStart,
    period,
    dryRun,
    artists: [],
    sent: 0,
    failed: 0,
    skipped: 0,
    campaignId: null,
    error: null,
  };

  const [artists, done] = await Promise.all([deps.listActiveArtists(), deps.sentThisWeek(weekStart)]);
  const prepared: Prepared[] = [];

  for (const a of artists) {
    const team = await deps.listTeam(a.slug);
    const outcome: ArtistBriefOutcome = {
      slug: a.slug,
      displayName: a.displayName,
      teamSize: team.length,
      recipients: 0,
      subject: "",
      status: "skipped",
      sent: 0,
      failed: 0,
    };
    if (team.length === 0) {
      outcome.reason = "no portal team";
      base.artists.push(outcome);
      base.skipped++;
      continue;
    }
    if (!providerReady) {
      outcome.reason = TEAM_BRIEF_NO_PROVIDER;
      base.artists.push(outcome);
      base.skipped++;
      continue;
    }
    if (!dryRun && done.has(a.slug)) {
      outcome.reason = `already sent for week ${weekStart}`;
      base.artists.push(outcome);
      base.skipped++;
      continue;
    }
    const members = team.filter((m) => m.email && (!wanted || m.email.toLowerCase() === wanted));
    const raw = await deps.loadRaw(a, team, period, now);
    const content = renderTeamBrief(gatherTeamBrief(raw, now), baseHref);
    outcome.subject = content.subject;
    outcome.recipients = members.length;
    if (members.length === 0) {
      outcome.reason = wanted ? "no team member matches testEmail" : "no team member has an email";
      base.artists.push(outcome);
      base.skipped++;
      continue;
    }
    if (dryRun) {
      outcome.status = "dry-run";
      if (done.has(a.slug)) outcome.reason = `a real run would skip: already sent for week ${weekStart}`;
      base.artists.push(outcome);
      continue;
    }
    prepared.push({ artist: outcome, members, content });
  }

  if (dryRun || prepared.length === 0) return base;

  // One recipient per (artist, member); the id carries both so outcomes
  // map back. A member on two teams gets two briefs, which is right.
  const key = (slug: string, userId: string) => `${slug}\u0000${userId}`;
  const recipients: TransactionalRecipient[] = [];
  const lookup = new Map<string, { p: Prepared; m: TeamMember }>();
  for (const p of prepared) {
    for (const m of p.members) {
      const id = key(p.artist.slug, m.userId);
      lookup.set(id, { p, m });
      recipients.push({
        id,
        email: m.email as string,
        name: m.name,
        subject: p.content.subject,
        html: p.content.html,
        text: p.content.text,
      });
    }
  }

  const batch = await send(recipients);
  base.provider = batch.provider;
  base.campaignId = batch.campaignId;
  base.error = batch.error;

  const sentAt = now.toISOString();
  const logRows: TeamBriefLog[] = [];
  for (const o of batch.outcomes) {
    const hit = lookup.get(o.id);
    if (!hit) continue;
    const { p, m } = hit;
    if (o.ok) p.artist.sent++;
    else p.artist.failed++;
    logRows.push({
      fan_id: m.userId,
      channel: "email",
      notification_type: TEAM_BRIEF_KIND,
      title: p.content.subject,
      body: p.content.text,
      url: "/artist-portal/brief",
      // A ?testEmail send is real mail but not the week's brief: log it
      // 'suppressed' so sentThisWeek never counts it.
      status: !o.ok ? "failed" : wanted ? "suppressed" : "sent",
      suppression_reason: o.ok && wanted ? "test_email" : null,
      error: o.error ?? null,
      metadata: {
        week_start: weekStart,
        community_id: p.artist.slug,
        period_start: start,
        period_end: end,
        provider: batch.provider,
        campaign_id: batch.campaignId,
        test_email: wanted,
      },
      sent_at: sentAt,
    });
  }
  for (const p of prepared) {
    const a = p.artist;
    a.status = a.failed === 0 ? "sent" : a.sent === 0 ? "failed" : "partial";
    base.sent += a.sent;
    base.failed += a.failed;
    base.artists.push(a);
  }

  const { error: logErr } = await deps.insertLogs(logRows);
  if (logErr) {
    // The sends went out; without the rows the next run would resend.
    console.error("[weekly-team-brief] notification_log insert failed:", logErr.message);
    base.error = base.error
      ? `${base.error}; notification_log insert failed: ${logErr.message}`
      : `notification_log insert failed: ${logErr.message}`;
  }
  return base;
}
