import { escapeHtml } from "../digest/lapsed-email.ts";
import { thankScoreLegend } from "../superfans/to-thank.ts";
import type { TeamBriefData } from "./gather.ts";

/**
 * Render one artist's Monday team brief to { subject, html, text }. Pure —
 * the same data renders the same email every time, which is what the
 * dry run returns and the test pins down.
 */

export type TeamBriefContent = {
  subject: string;
  html: string;
  text: string;
};

export const TEAM_BRIEF_SUBJECT_MAX = 120;

function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** "Oct 20 – Oct 26" for a [start, end) window. */
export function briefRangeLabel(period: { start: string; end: string }): string {
  const lastDay = new Date(Date.parse(period.end) - 24 * 60 * 60 * 1000).toISOString();
  return `${fmtDate(period.start)} – ${fmtDate(lastDay)}`;
}

function n(v: number): string {
  return v.toLocaleString("en-US");
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${n(count)} ${count === 1 ? one : many}`;
}

export function teamBriefSubject(data: TeamBriefData): string {
  const s = data.stats;
  const parts = [
    plural(s.newFollowers, "new follower"),
    plural(s.postsByFans + s.postsByTeam, "post"),
    plural(s.comments, "comment"),
  ];
  const subject = `Monday brief · ${data.community.displayName}: ${parts.join(", ")}`;
  return subject.length <= TEAM_BRIEF_SUBJECT_MAX
    ? subject
    : `${subject.slice(0, TEAM_BRIEF_SUBJECT_MAX - 1)}…`;
}

function tierLabel(tier: string | null): string {
  if (!tier) return "";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export function renderTeamBrief(data: TeamBriefData, baseHref: string): TeamBriefContent {
  const base = baseHref.replace(/\/+$/, "");
  const s = data.stats;
  const artist = data.community.displayName;
  const range = briefRangeLabel(data.period);
  const portalHref = `${base}/artist-portal/brief`;
  const superfansHref = `${base}/artist-portal/superfans`;
  const draftsHref = `${base}/artist-portal/community`;

  const rows: Array<[string, string]> = [
    ["New followers", n(s.newFollowers)],
    ["Posts by fans", n(s.postsByFans)],
    ["Posts by your team", n(s.postsByTeam)],
    ["Comments", n(s.comments)],
    ["Reactions", n(s.reactions)],
    ["Check-ins", n(s.checkins)],
    ["RSVPs", n(s.rsvps)],
    ["Redemptions", n(s.redemptions)],
    ["Points awarded", n(s.pointsAwarded)],
    ["Fans active", n(s.activeFans)],
  ];

  // ── text ────────────────────────────────────────────────────────────────
  const t: string[] = [];
  t.push(`${artist} — Monday team brief (${range})`);
  t.push("");
  t.push("Last week");
  for (const [label, value] of rows) t.push(`  ${label}: ${value}`);
  t.push("");
  t.push("Top fans by points this week");
  if (data.topFans.length === 0) t.push("  No points were earned last week.");
  for (const f of data.topFans) {
    const tier = tierLabel(f.tier);
    t.push(`  ${f.name}${tier ? ` (${tier})` : ""} — ${n(f.points)} pts${f.profilePath ? ` · ${base}${f.profilePath}` : ""}`);
  }
  t.push("");
  t.push("Superfans to thank");
  if (data.superfansToThank.length === 0) t.push("  Nobody new — everyone active lately has been thanked recently.");
  for (const f of data.superfansToThank) {
    const since = f.daysSinceActivity == null ? "" : ` · last active ${plural(f.daysSinceActivity, "day")} ago`;
    t.push(`  ${f.name}${f.tier ? ` (${tierLabel(f.tier)})` : ""} — score ${f.score}${since}`);
  }
  t.push(`  Mark them thanked: ${superfansHref}`);
  t.push("");
  t.push(`Upcoming events (next 14 days)`);
  if (data.upcomingEvents.length === 0) t.push("  Nothing scheduled.");
  for (const e of data.upcomingEvents) {
    t.push(`  ${e.day ?? e.when ?? "TBA"} — ${e.title}${e.url ? ` · ${e.url}` : ""}`);
  }
  t.push("");
  if (data.pendingDrafts > 0) {
    t.push(`${plural(data.pendingDrafts, "AI post draft")} waiting for review: ${draftsHref}`);
    t.push("");
  }
  t.push(`Full brief in the portal: ${portalHref}`);
  const text = t.join("\n");

  // ── html ────────────────────────────────────────────────────────────────
  const h: string[] = [];
  const esc = escapeHtml;
  h.push(`<h1 style="margin:0 0 4px 0; font-size:20px; color:#111;">${esc(artist)} — Monday team brief</h1>`);
  h.push(`<p style="margin:0 0 20px 0; font-size:13px; color:#666;">${esc(range)}</p>`);
  h.push(`<h2 style="margin:0 0 8px 0; font-size:14px; color:#111; text-transform:uppercase; letter-spacing:0.06em;">Last week</h2>`);
  h.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse; width:100%; font-size:14px; color:#222;">`);
  for (const [label, value] of rows) {
    h.push(
      `<tr><td style="padding:6px 0; border-bottom:1px solid #eee;">${esc(label)}</td>` +
        `<td style="padding:6px 0; border-bottom:1px solid #eee; text-align:right; font-weight:600;">${esc(value)}</td></tr>`,
    );
  }
  h.push(`</table>`);

  const section = (title: string) =>
    `<h2 style="margin:24px 0 8px 0; font-size:14px; color:#111; text-transform:uppercase; letter-spacing:0.06em;">${esc(title)}</h2>`;
  const item = (inner: string) => `<li style="margin:0 0 6px 0; font-size:14px; color:#222;">${inner}</li>`;
  const nameLink = (name: string, path: string | null) =>
    path ? `<a href="${esc(base + path)}" style="color:#111;">${esc(name)}</a>` : esc(name);

  h.push(section("Top fans by points this week"));
  if (data.topFans.length === 0) {
    h.push(`<p style="margin:0; font-size:14px; color:#666;">No points were earned last week.</p>`);
  } else {
    h.push(`<ul style="margin:0; padding-left:18px;">`);
    for (const f of data.topFans) {
      const tier = tierLabel(f.tier);
      h.push(item(`${nameLink(f.name, f.profilePath)}${tier ? ` <span style="color:#666;">(${esc(tier)})</span>` : ""} — ${esc(n(f.points))} pts`));
    }
    h.push(`</ul>`);
  }

  h.push(section("Superfans to thank"));
  if (data.superfansToThank.length === 0) {
    h.push(`<p style="margin:0; font-size:14px; color:#666;">Nobody new — everyone active lately has been thanked recently.</p>`);
  } else {
    h.push(`<ul style="margin:0; padding-left:18px;">`);
    for (const f of data.superfansToThank) {
      const since = f.daysSinceActivity == null ? "" : ` · last active ${esc(plural(f.daysSinceActivity, "day"))} ago`;
      h.push(item(`${nameLink(f.name, f.profilePath)}${f.tier ? ` <span style="color:#666;">(${esc(tierLabel(f.tier))})</span>` : ""} — score ${f.score}${since}`));
    }
    h.push(`</ul>`);
    h.push(`<p style="margin:8px 0 0 0; font-size:12px; color:#666;">Score: ${esc(thankScoreLegend())}.</p>`);
  }
  h.push(`<p style="margin:8px 0 0 0; font-size:14px;"><a href="${esc(superfansHref)}" style="color:#111;">Mark them thanked →</a></p>`);

  h.push(section("Upcoming events (next 14 days)"));
  if (data.upcomingEvents.length === 0) {
    h.push(`<p style="margin:0; font-size:14px; color:#666;">Nothing scheduled.</p>`);
  } else {
    h.push(`<ul style="margin:0; padding-left:18px;">`);
    for (const e of data.upcomingEvents) {
      const title = e.url ? `<a href="${esc(e.url)}" style="color:#111;">${esc(e.title)}</a>` : esc(e.title);
      h.push(item(`<span style="color:#666;">${esc(e.day ?? e.when ?? "TBA")}</span> — ${title}`));
    }
    h.push(`</ul>`);
  }

  if (data.pendingDrafts > 0) {
    h.push(
      `<p style="margin:24px 0 0 0; padding:12px 14px; background:#f6f3ff; border-radius:8px; font-size:14px; color:#222;">` +
        `${esc(plural(data.pendingDrafts, "AI post draft"))} waiting for review. <a href="${esc(draftsHref)}" style="color:#111;">Review →</a></p>`,
    );
  }
  h.push(`<p style="margin:24px 0 0 0; font-size:14px;"><a href="${esc(portalHref)}" style="color:#111;">Full brief in the portal →</a></p>`);

  return { subject: teamBriefSubject(data), html: h.join("\n"), text };
}
