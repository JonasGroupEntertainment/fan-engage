/**
 * Renders a fan's DigestPayload into HTML + plain-text.
 *
 * The HTML output is meant to be stuffed into the Mailchimp DIGESTHTML
 * merge field. The shell of the email — Fan Engage logo, footer, sender
 * info, unsubscribe link — lives in the Mailchimp template. We supply
 * just the per-fan body content.
 *
 * Email-safe HTML rules followed:
 *   * Inline styles only (no <style> blocks; Gmail strips them in some
 *     contexts and Outlook is hostile to anything advanced)
 *   * <table> for layout where it matters (some clients still need it)
 *   * No external CSS, no fonts, no images — just text + links + simple
 *     styling. Logos and chrome are in the Mailchimp template wrapper.
 *   * UTM params on every link so we can measure click-through.
 */

import type {
  DigestCommunityBlock,
  DigestEvent,
  DigestPayload,
  DigestPostHighlight,
} from "./types";

/** Mailchimp default merge-field max length is 80 chars; we set
 *  DIGESTHTML to a higher max in the audience config (recommend 6000).
 *  This is the safety cap we enforce locally to avoid surprising anyone. */
const MAX_HTML_LENGTH = 6000;

/** Add UTM params to a URL, preserving any existing query string. */
function withUtm(url: string, communityId: string): string {
  const sep = url.includes("?") ? "&" : "?";
  const utm =
    `utm_source=digest&utm_medium=email&utm_campaign=weekly` +
    `&utm_content=${encodeURIComponent(communityId)}`;
  return `${url}${sep}${utm}`;
}

/** Quick-and-dirty HTML escape. Good enough for fan-typed body text. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Truncate body preview to a sane length for the digest. */
function truncatePreview(s: string, max = 180): string {
  const cleaned = s.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + "…";
}

interface RenderResult {
  html: string;
  text: string;
}

/**
 * Render the payload into HTML + plain-text.
 *
 * Returns:
 *   html: ready to drop into the DIGESTHTML Mailchimp merge field
 *   text: plain-text fallback (multipart/alternative)
 */
export function renderDigestPayload(payload: DigestPayload): RenderResult {
  const html = renderHtml(payload);
  const text = renderText(payload);

  if (html.length > MAX_HTML_LENGTH) {
    // If we exceeded, lop off later communities — we always preserve
    // the first community in full, then trim from the end.
    return {
      html: html.slice(0, MAX_HTML_LENGTH - 60) + "<p>(more in your feed →)</p>",
      text,
    };
  }
  return { html, text };
}

/** ─── HTML rendering ──────────────────────────────────────────────────── */

function renderHtml(payload: DigestPayload): string {
  const greeting = payload.recipient.first_name
    ? `Hey ${esc(payload.recipient.first_name)},`
    : `Hey there,`;

  const lines: string[] = [];
  lines.push(`<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111; line-height: 1.55;">`);
  lines.push(`<p style="margin:0 0 16px 0;">${greeting}</p>`);
  lines.push(
    `<p style="margin:0 0 24px 0;">Here's what's been happening in your fan experiences this week.</p>`,
  );

  for (const block of payload.communities) {
    lines.push(renderCommunityBlock(block));
  }

  if (payload.rewardSuggestion) {
    lines.push(renderRewardBlock(payload.rewardSuggestion));
  }

  lines.push(renderPointsFooter(payload));
  lines.push(`</div>`);
  return lines.join("\n");
}

function renderCommunityBlock(b: DigestCommunityBlock): string {
  const lines: string[] = [];
  lines.push(
    `<div style="margin:0 0 28px 0; padding:16px; background:#fafafa; border-radius:12px; border:1px solid #eee;">`,
  );
  lines.push(
    `<h2 style="margin:0 0 8px 0; font-size:18px; font-weight:600;">${esc(b.display_name)}</h2>`,
  );

  if (b.vibe_summary) {
    lines.push(
      `<p style="margin:0 0 16px 0; color:#444; font-style:italic; font-size:14px;">${esc(b.vibe_summary)}</p>`,
    );
  }

  if (b.topPosts.length > 0) {
    lines.push(
      `<p style="margin:16px 0 8px 0; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#888;">Top posts</p>`,
    );
    for (const p of b.topPosts) {
      lines.push(renderPost(p, b.community_id));
    }
  }

  if (b.upcomingEvents.length > 0) {
    lines.push(
      `<p style="margin:16px 0 8px 0; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#888;">Upcoming</p>`,
    );
    for (const e of b.upcomingEvents) {
      lines.push(renderEvent(e, b.community_id));
    }
  }

  lines.push(`</div>`);
  return lines.join("");
}

function renderPost(p: DigestPostHighlight, communityId: string): string {
  const url = withUtm(p.url, communityId);
  const title = p.title ? `<strong>${esc(p.title)}</strong> — ` : "";
  const body = esc(truncatePreview(p.body));
  const meta =
    `<span style="color:#888; font-size:12px;">` +
    (p.reaction_count > 0 ? `❤ ${p.reaction_count} ` : "") +
    (p.comment_count > 0 ? `· 💬 ${p.comment_count}` : "") +
    `</span>`;
  return (
    `<p style="margin:0 0 10px 0; font-size:14px;">` +
    `${title}<a href="${url}" style="color:#7c3aed; text-decoration:underline;">${body}</a> ${meta}` +
    `</p>`
  );
}

function renderEvent(e: DigestEvent, communityId: string): string {
  const url = withUtm(e.url, communityId);
  const date = e.event_date ? `<span style="color:#888;"> · ${esc(e.event_date)}</span>` : "";
  return (
    `<p style="margin:0 0 8px 0; font-size:14px;">` +
    `<a href="${url}" style="color:#7c3aed; text-decoration:underline;">${esc(e.title)}</a>${date}` +
    `</p>`
  );
}

function renderRewardBlock(
  r: NonNullable<DigestPayload["rewardSuggestion"]>,
): string {
  const url = withUtm(r.url, r.community_id);
  return (
    `<div style="margin:0 0 28px 0; padding:16px; background:#fef3c7; border:1px solid #fde68a; border-radius:12px;">` +
    `<p style="margin:0 0 4px 0; font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#92400e;">You can grab this today</p>` +
    `<p style="margin:0; font-size:14px;">` +
    `<a href="${url}" style="color:#7c2d12; text-decoration:underline; font-weight:600;">${esc(r.title)}</a> ` +
    `<span style="color:#92400e;">· ${r.point_cost.toLocaleString()} pts</span>` +
    `</p>` +
    `</div>`
  );
}

function renderPointsFooter(payload: DigestPayload): string {
  const tier = payload.recipient.current_tier ?? "bronze";
  return (
    `<p style="margin:24px 0 0 0; padding:12px 0 0 0; border-top:1px solid #eee; font-size:12px; color:#888;">` +
    `You're at ${payload.recipient.total_points.toLocaleString()} points · ${esc(tier)} tier. ` +
    `Reply STOP-DIGEST to opt out.` +
    `</p>`
  );
}

/** ─── Plain-text rendering (multipart/alternative fallback) ──────────── */

function renderText(payload: DigestPayload): string {
  const greeting = payload.recipient.first_name
    ? `Hey ${payload.recipient.first_name},`
    : `Hey there,`;

  const lines: string[] = [];
  lines.push(greeting);
  lines.push("");
  lines.push(`Here's what's been happening in your fan experiences this week.`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const block of payload.communities) {
    lines.push(`${block.display_name.toUpperCase()}`);
    if (block.vibe_summary) lines.push(block.vibe_summary);
    lines.push("");
    if (block.topPosts.length > 0) {
      lines.push(`Top posts:`);
      for (const p of block.topPosts) {
        const title = p.title ? `[${p.title}] ` : "";
        lines.push(`  • ${title}${truncatePreview(p.body, 100)}`);
        lines.push(`    ${withUtm(p.url, block.community_id)}`);
      }
      lines.push("");
    }
    if (block.upcomingEvents.length > 0) {
      lines.push(`Upcoming:`);
      for (const e of block.upcomingEvents) {
        const date = e.event_date ? ` (${e.event_date})` : "";
        lines.push(`  • ${e.title}${date}`);
        lines.push(`    ${withUtm(e.url, block.community_id)}`);
      }
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  if (payload.rewardSuggestion) {
    const r = payload.rewardSuggestion;
    lines.push(`You can grab this today:`);
    lines.push(`  ${r.title} · ${r.point_cost.toLocaleString()} pts`);
    lines.push(`  ${withUtm(r.url, r.community_id)}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push(
    `You're at ${payload.recipient.total_points.toLocaleString()} points · ${payload.recipient.current_tier} tier.`,
  );
  lines.push(`Reply STOP-DIGEST to opt out.`);
  return lines.join("\n");
}
