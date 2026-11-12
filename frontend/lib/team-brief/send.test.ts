import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TransactionalBatchResult, TransactionalRecipient } from "../email/transactional.ts";
import { sentCommunitiesFromLogs, type TeamBriefDeps, type TeamBriefLog, type TeamMember } from "./data.ts";
import type { TeamBriefRaw } from "./gather.ts";
import { runTeamBrief } from "./send.ts";

const NOW = new Date("2026-11-02T13:00:00Z");
const ENV = { MANDRILL_API_KEY: "test-key" };

function rawFor(slug: string, team: TeamMember[], period: { start: string; end: string }): TeamBriefRaw {
  return {
    community: { slug, displayName: `Artist ${slug}` },
    period,
    team: team.map((t) => ({ user_id: t.userId, role: t.role })),
    follows: [{ fan_id: "f1", at: "2026-10-28T00:00:00.000Z" }],
    posts: [],
    comments: [],
    reactions: [],
    checkins: [],
    rsvps: [],
    redemptions: [],
    ledger: [],
    events: [],
    pendingDrafts: 0,
    thanks: [],
    fans: [],
    memberships: [],
  };
}

function stubDeps(input: {
  artists: Array<{ slug: string; displayName: string }>;
  teams: Record<string, TeamMember[]>;
  sent?: string[];
  insertError?: string;
}) {
  const inserted: TeamBriefLog[][] = [];
  const deps: TeamBriefDeps = {
    listActiveArtists: async () => input.artists,
    listTeam: async (slug) => input.teams[slug] ?? [],
    loadRaw: async (artist, team, period) => rawFor(artist.slug, team, period),
    sentThisWeek: async (weekStart) =>
      input.sent ? new Set(input.sent) : sentCommunitiesFromLogs(inserted.flat(), weekStart),
    insertLogs: async (rows) => {
      inserted.push(rows);
      return { error: input.insertError ? { message: input.insertError } : null };
    },
  };
  return { deps, inserted };
}

function okSend(calls: TransactionalRecipient[][]) {
  return async (recipients: readonly TransactionalRecipient[]): Promise<TransactionalBatchResult> => {
    calls.push([...recipients]);
    return {
      provider: "mandrill",
      outcomes: recipients.map((r) => ({ id: r.id, ok: !r.email.startsWith("bounce") , ...(r.email.startsWith("bounce") ? { error: "Mandrill status rejected" } : {}) })),
      campaignId: null,
      error: null,
    };
  };
}

const TEAMS: Record<string, TeamMember[]> = {
  one: [
    { userId: "u1", role: "owner", email: "owner@example.com", name: "Olive Owner" },
    { userId: "u2", role: "viewer", email: null, name: "No Mail" },
  ],
  two: [{ userId: "u3", role: "admin", email: "bounce@example.com", name: "" }],
  three: [],
};
const ARTISTS = [
  { slug: "one", displayName: "Artist One" },
  { slug: "two", displayName: "Artist Two" },
  { slug: "three", displayName: "Artist Three" },
];

describe("runTeamBrief", () => {
  it("sends one brief per team member with an email, logs each, and skips artists without a team", async () => {
    const { deps, inserted } = stubDeps({ artists: ARTISTS, teams: TEAMS });
    const calls: TransactionalRecipient[][] = [];
    const res = await runTeamBrief({ deps, dryRun: false, testEmail: null, now: NOW, send: okSend(calls), env: ENV, baseHref: "https://example.com" });

    assert.equal(res.weekStart, "2026-11-02");
    assert.equal(res.sent, 1);
    assert.equal(res.failed, 1);
    assert.equal(res.skipped, 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].map((r) => [r.email, r.name]), [["owner@example.com", "Olive Owner"], ["bounce@example.com", ""]]);
    assert.ok(calls[0][0].subject.startsWith("Monday brief · Artist one: 1 new follower"));

    const byStatus = Object.fromEntries(res.artists.map((a) => [a.slug, a.status]));
    assert.deepEqual(byStatus, { one: "sent", two: "failed", three: "skipped" });

    assert.equal(inserted.length, 1);
    const rows = inserted[0];
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => [r.fan_id, r.status]), [["u1", "sent"], ["u3", "failed"]]);
    assert.equal(rows[0].notification_type, "team_brief");
    assert.equal(rows[0].channel, "email");
    assert.equal(rows[0].metadata.week_start, "2026-11-02");
    assert.equal(rows[0].metadata.community_id, "one");
    assert.equal(rows[1].error, "Mandrill status rejected");
  });

  it("dedups per artist per week on 'sent' rows", async () => {
    const { deps, inserted } = stubDeps({ artists: ARTISTS, teams: TEAMS, sent: ["one"] });
    const calls: TransactionalRecipient[][] = [];
    const res = await runTeamBrief({ deps, dryRun: false, testEmail: null, now: NOW, send: okSend(calls), env: ENV });
    assert.equal(res.artists.find((a) => a.slug === "one")?.status, "skipped");
    assert.match(res.artists.find((a) => a.slug === "one")?.reason ?? "", /already sent for week 2026-11-02/);
    assert.deepEqual(calls[0].map((r) => r.email), ["bounce@example.com"]);
    assert.equal(inserted[0].length, 1);
  });

  it("dry run renders subjects and recipient counts but sends and logs nothing", async () => {
    const { deps, inserted } = stubDeps({ artists: ARTISTS, teams: TEAMS, sent: ["one"] });
    const calls: TransactionalRecipient[][] = [];
    const res = await runTeamBrief({ deps, dryRun: true, testEmail: null, now: NOW, send: okSend(calls), env: ENV });
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
    assert.equal(res.dryRun, true);
    const one = res.artists.find((a) => a.slug === "one")!;
    assert.equal(one.status, "dry-run");
    assert.equal(one.recipients, 1);
    assert.equal(one.teamSize, 2);
    assert.match(one.subject, /^Monday brief · Artist one/);
    assert.match(one.reason ?? "", /already sent/);
    assert.equal(res.artists.find((a) => a.slug === "three")?.reason, "no portal team");
  });

  it("testEmail restricts every artist to that one address and logs the send as suppressed", async () => {
    const { deps, inserted } = stubDeps({ artists: ARTISTS, teams: TEAMS });
    const calls: TransactionalRecipient[][] = [];
    const res = await runTeamBrief({ deps, dryRun: false, testEmail: "Owner@Example.com", now: NOW, send: okSend(calls), env: ENV });
    assert.deepEqual(calls[0].map((r) => r.email), ["owner@example.com"]);
    assert.equal(res.artists.find((a) => a.slug === "two")?.reason, "no team member matches testEmail");
    assert.equal(inserted[0][0].status, "suppressed");
    assert.equal(inserted[0][0].suppression_reason, "test_email");
    assert.equal(inserted[0][0].metadata.test_email, "owner@example.com");
  });

  it("a Monday testEmail smoke test does not burn the week: the real run still sends", async () => {
    const { deps, inserted } = stubDeps({ artists: ARTISTS, teams: TEAMS });
    const calls: TransactionalRecipient[][] = [];
    await runTeamBrief({ deps, dryRun: false, testEmail: "owner@example.com", now: NOW, send: okSend(calls), env: ENV });
    const real = await runTeamBrief({ deps, dryRun: false, testEmail: null, now: NOW, send: okSend(calls), env: ENV });
    assert.equal(real.artists.find((a) => a.slug === "one")?.status, "sent");
    assert.deepEqual(calls[1].map((r) => r.email), ["owner@example.com", "bounce@example.com"]);
    // …and a third real run the same week is deduped on the clean 'sent' row.
    const again = await runTeamBrief({ deps, dryRun: false, testEmail: null, now: NOW, send: okSend(calls), env: ENV });
    assert.equal(again.artists.find((a) => a.slug === "one")?.status, "skipped");
    assert.equal(inserted.flat().filter((r) => r.status === "sent").length, 1);
  });

  it("sentCommunitiesFromLogs ignores failed, suppressed and other-week rows", () => {
    const done = sentCommunitiesFromLogs(
      [
        { status: "sent", metadata: { week_start: "2026-11-02", community_id: "one" } },
        { status: "sent", metadata: { week_start: "2026-11-02", community_id: "two", test_email: "x@example.com" } },
        { status: "suppressed", metadata: { week_start: "2026-11-02", community_id: "three" } },
        { status: "failed", metadata: { week_start: "2026-11-02", community_id: "four" } },
        { status: "sent", metadata: { week_start: "2026-10-26", community_id: "five" } },
      ],
      "2026-11-02",
    );
    assert.deepEqual([...done], ["one"]);
  });

  it("reports a failed notification_log insert without losing the send counts", async () => {
    const { deps } = stubDeps({ artists: ARTISTS, teams: TEAMS, insertError: "boom" });
    const res = await runTeamBrief({ deps, dryRun: false, testEmail: null, now: NOW, send: okSend([]), env: ENV });
    assert.equal(res.sent, 1);
    assert.match(res.error ?? "", /notification_log insert failed: boom/);
  });

  it("without MANDRILL_API_KEY it skips every artist with the Mailchimp warning, sends and writes nothing", async () => {
    const { deps, inserted } = stubDeps({ artists: ARTISTS, teams: TEAMS });
    const calls: TransactionalRecipient[][] = [];
    for (const dryRun of [true, false]) {
      const res = await runTeamBrief({ deps, dryRun, testEmail: null, now: NOW, send: okSend(calls), env: { MAILCHIMP_API_KEY: "k", MAILCHIMP_SERVER_PREFIX: "us1", MAILCHIMP_AUDIENCE_ID: "a" } });
      assert.equal(res.provider, null);
      assert.equal(res.error, null);
      assert.equal(res.sent, 0);
      for (const a of res.artists.filter((a) => a.teamSize > 0)) {
        assert.equal(a.status, "skipped", a.slug);
        assert.match(a.reason ?? "", /needs MANDRILL_API_KEY; Mailchimp would enrol team members/);
      }
    }
    assert.equal(calls.length, 0);
    assert.equal(inserted.length, 0);
  });
});
