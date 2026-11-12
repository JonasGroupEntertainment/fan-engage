import { communityPath } from "../community-default.ts";

/**
 * "It's been a minute" email for fans who went quiet 14–30 days ago.
 * Same shell as the weekly digest campaign template (lib/digest/send.ts)
 * so the two read as one series. One paragraph naming the fan's artist,
 * one CTA to that artist's community page.
 *
 * Pure: no env, no Supabase. The sender (lapsed-send.ts) decides whether
 * this becomes a Mandrill message or a Mailchimp merge-field payload.
 */

export const LAPSED_SUBJECT_MAX = 78;

export type LapsedEmailInput = {
  firstName: string;
  artistSlug: string;
  /** artists.name; falls back to the slug when the row is missing. */
  artistName: string;
  daysSinceActivity: number;
  /** App origin, no trailing slash. */
  baseHref: string;
};

export type LapsedEmailContent = {
  subject: string;
  html: string;
  text: string;
  /** Where the CTA points (also recorded on notification_log.url). */
  ctaHref: string;
  ctaPath: string;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Collapse whitespace and strip Mailchimp merge tags (`*|FNAME|*`). */
export function clean(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\*\|[^|]*\|\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function lapsedSubject(firstName: string, artistName: string): string {
  const name = clean(firstName) || "there";
  const artist = clean(artistName);
  const subject = artist
    ? `It's been a minute, ${name} — ${artist} kept going`
    : `It's been a minute, ${name}`;
  if (subject.length <= LAPSED_SUBJECT_MAX) return subject;
  return `${subject.slice(0, LAPSED_SUBJECT_MAX - 1).trimEnd()}…`;
}

export function buildLapsedEmail(input: LapsedEmailInput): LapsedEmailContent {
  const name = clean(input.firstName) || "there";
  const artist = clean(input.artistName) || clean(input.artistSlug) || "your artist";
  const subject = lapsedSubject(input.firstName, artist);

  const base = input.baseHref.replace(/\/+$/, "");
  const ctaPath = input.artistSlug ? communityPath(input.artistSlug, "community") : "/";
  const ctaHref = ctaPath === "/" ? base : `${base}${ctaPath}`;
  const ctaLabel = `See what's new from ${artist}`;

  const days = Math.max(0, Math.floor(Number(input.daysSinceActivity) || 0));
  const away = days >= 21 ? "the last few weeks" : "the last couple of weeks";
  const paragraph =
    `${artist} kept posting over ${away} while you were away — new posts, ` +
    `points to earn, and rewards you can still unlock. One reaction counts, ` +
    `and your points are right where you left them.`;

  const text = [
    `Hey ${name}, it's been a minute.`,
    "",
    paragraph,
    "",
    `${ctaLabel}: ${ctaHref}`,
    "",
    "You're getting this because you opted into Fan Engage email updates.",
  ].join("\n");

  const html = `<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
  <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;line-height:1.25;">Hey ${escapeHtml(name)}, it&rsquo;s been a minute</h1>
  <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">${escapeHtml(paragraph)}</p>
  <p style="margin:0 0 8px;">
    <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:999px;">${escapeHtml(ctaLabel)}</a>
  </p>
</div>`;

  return { subject, html, text, ctaHref, ctaPath };
}
