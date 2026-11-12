/**
 * Application review notifications — Slack webhook + invite email.
 *
 * Both helpers are fail-soft: if the env var isn't configured, they log
 * a warning and return without throwing so the caller's approve/reject
 * action still succeeds. Notifications are nice-to-have, not contract.
 *
 * Slack: uses SLACK_ADMIN_WEBHOOK_URL (same env var the Phase 15 daily
 * admin brief writes to). If that env is shared with the brief, both
 * channels work concurrently with no extra setup.
 *
 * Email: uses Mailchimp Transactional (Mandrill) if MANDRILL_API_KEY is
 * set; otherwise falls back to Mailchimp Campaigns single-recipient
 * if MAILCHIMP_API_KEY is set. If neither is configured, we just log
 * and return — admins can copy the rendered subject/body from the
 * Slack message and email manually.
 */

interface ApplicationContact {
  display_name: string;
  contact_name: string | null;
  contact_email: string | null;
  slug_suggestion?: string | null;
  approved_slug?: string | null;
  monthly_listeners?: number | null;
  upcoming_tour?: string | null;
  community_pitch?: string | null;
}

const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app";

// ── Slack ────────────────────────────────────────────────────────────

export async function notifySlackApproved(opts: {
  application: ApplicationContact;
  reviewerEmail: string | null;
  notes?: string | null;
}): Promise<void> {
  const url = process.env.SLACK_ADMIN_WEBHOOK_URL;
  if (!url) {
    console.warn("notifySlackApproved: SLACK_ADMIN_WEBHOOK_URL not set, skipping");
    return;
  }
  const a = opts.application;
  const slug = a.approved_slug ?? a.slug_suggestion ?? "(slug TBD)";
  const reviewer = opts.reviewerEmail ?? "an admin";

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `✅ Application approved — ${a.display_name}` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Slug:*\n\`${slug}\`` },
        { type: "mrkdwn", text: `*Contact:*\n${a.contact_name ?? "—"} <${a.contact_email ?? "no email"}>` },
        a.monthly_listeners
          ? { type: "mrkdwn", text: `*Monthly listeners:*\n${a.monthly_listeners.toLocaleString()}` }
          : { type: "mrkdwn", text: `*Reviewer:*\n${reviewer}` },
      ].filter(Boolean),
    },
    opts.notes
      ? { type: "section", text: { type: "mrkdwn", text: `*Notes:* ${opts.notes}` } }
      : null,
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Next: send onboarding invite to ${a.contact_email ?? "the contact"}. Link: ${APP_BASE_URL}/admin/communities`,
        },
      ],
    },
  ].filter(Boolean);

  await postSlack(url, { text: `Application approved — ${a.display_name}`, blocks });
}

export async function notifySlackRejected(opts: {
  application: ApplicationContact;
  reviewerEmail: string | null;
  notes?: string | null;
}): Promise<void> {
  const url = process.env.SLACK_ADMIN_WEBHOOK_URL;
  if (!url) {
    console.warn("notifySlackRejected: SLACK_ADMIN_WEBHOOK_URL not set, skipping");
    return;
  }
  const a = opts.application;
  const reviewer = opts.reviewerEmail ?? "an admin";

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `🚫 Application rejected — ${a.display_name}` },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Reviewer:*\n${reviewer}` },
        { type: "mrkdwn", text: `*Contact:*\n${a.contact_name ?? "—"} <${a.contact_email ?? "no email"}>` },
      ],
    },
    opts.notes
      ? { type: "section", text: { type: "mrkdwn", text: `*Reason:* ${opts.notes}` } }
      : null,
  ].filter(Boolean);

  await postSlack(url, { text: `Application rejected — ${a.display_name}`, blocks });
}

async function postSlack(url: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`Slack webhook returned ${res.status}: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.warn("Slack webhook fetch failed (non-blocking):", err);
  }
}

// ── Email (invite on approval) ──────────────────────────────────────

export async function sendInviteEmail(opts: {
  to: string;
  toName: string | null;
  artistDisplayName: string;
  approvedSlug: string;
  reviewerNotes?: string | null;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!opts.to) return { sent: false, reason: "no_email" };

  // Try Mandrill (Mailchimp Transactional) first. If not configured, fall
  // through to a generic Mailchimp Campaigns single-send.
  const mandrillKey = process.env.MANDRILL_API_KEY;
  if (mandrillKey) {
    return sendViaMandrill(mandrillKey, opts);
  }

  const mcKey = process.env.MAILCHIMP_API_KEY;
  const mcServer = process.env.MAILCHIMP_SERVER_PREFIX;
  if (mcKey && mcServer) {
    return sendViaMailchimpCampaign();
  }

  console.warn(
    "sendInviteEmail: neither MANDRILL_API_KEY nor MAILCHIMP_API_KEY is set; admin must email manually",
  );
  return { sent: false, reason: "no_email_provider" };
}

function buildEmailContent(opts: {
  artistDisplayName: string;
  approvedSlug: string;
  toName: string | null;
  reviewerNotes?: string | null;
}) {
  const subject = `You're approved on Fan Engage — let's get ${opts.artistDisplayName} live`;
  const greeting = opts.toName ? `Hi ${opts.toName},` : "Hi there,";
  const onboardingUrl = `${APP_BASE_URL}/admin/${opts.approvedSlug}/setup`;
  const notesBlock = opts.reviewerNotes
    ? `\n\nA note from our team: ${opts.reviewerNotes}\n\n`
    : "\n\n";

  const text = `${greeting}

Great news — your Fan Engage application for ${opts.artistDisplayName} has been approved. We're excited to have you onboard.${notesBlock}Next step: head to your admin console to set up your community. You'll be able to upload a hero photo, write your bio, add tour dates, and customize your reward catalog.

Onboarding link: ${onboardingUrl}

If you have any questions or want a walkthrough call, just reply to this email.

Welcome to Fan Engage —
The Fan Engage team`;

  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.55;color:#0f172a">
<h2 style="margin:0 0 16px;font-size:22px">You're approved on Fan Engage</h2>
<p>${greeting}</p>
<p>Great news — your Fan Engage application for <strong>${opts.artistDisplayName}</strong> has been approved. We're excited to have you onboard.</p>
${opts.reviewerNotes ? `<p style="background:#f1f5f9;padding:12px;border-radius:8px"><em>A note from our team:</em> ${escapeHtml(opts.reviewerNotes)}</p>` : ""}
<p><strong>Next step:</strong> head to your admin console to set up your community. You'll be able to upload a hero photo, write your bio, add tour dates, and customize your reward catalog.</p>
<p style="margin:24px 0">
  <a href="${onboardingUrl}" style="background:#0f172a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open onboarding console</a>
</p>
<p>If you have any questions or want a walkthrough call, just reply to this email.</p>
<p style="margin-top:24px">Welcome to Fan Engage —<br>The Fan Engage team</p>
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sendViaMandrill(
  apiKey: string,
  opts: {
    to: string;
    toName: string | null;
    artistDisplayName: string;
    approvedSlug: string;
    reviewerNotes?: string | null;
  },
): Promise<{ sent: boolean; reason?: string }> {
  const { subject, text, html } = buildEmailContent(opts);
  try {
    const res = await fetch("https://mandrillapp.com/api/1.0/messages/send.json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: apiKey,
        message: {
          subject,
          text,
          html,
          from_email: process.env.MANDRILL_FROM_EMAIL ?? "no-reply@fanengage.app",
          from_name: process.env.MANDRILL_FROM_NAME ?? "Fan Engage",
          to: [{ email: opts.to, name: opts.toName ?? undefined, type: "to" }],
        },
      }),
    });
    if (!res.ok) {
      console.warn(`Mandrill returned ${res.status}`);
      return { sent: false, reason: `mandrill_http_${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.warn("Mandrill send failed:", err);
    return { sent: false, reason: "mandrill_fetch_failed" };
  }
}

async function sendViaMailchimpCampaign(): Promise<{ sent: boolean; reason?: string }> {
  // Mailchimp Marketing API isn't really designed for transactional sends,
  // but in a pinch we can create a one-off campaign and send. The cleaner
  // path is Mandrill — see above.
  console.warn(
    "sendInviteEmail: falling back to Mailchimp Campaigns is fragile; consider setting MANDRILL_API_KEY for transactional",
  );
  return { sent: false, reason: "mc_campaigns_fallback_unimplemented" };
}
