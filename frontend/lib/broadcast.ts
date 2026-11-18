import { createAdminClient } from "@/lib/supabase/admin";
import { deliverSms, smsConfigurationError } from "@/lib/sms/deliver";
import { smsAgeAllowsSend } from "@/lib/sms/policy";

/**
 * Campaign broadcast helpers — send a single email or SMS blast to every fan
 * of an artist (or every fan globally) who has opted in via the matching
 * channel. Safe to call from server actions and API routes.
 */

export type BroadcastResult = {
  attempted: number;
  sent: number;
  failed: number;
  recipients: number; // how many fans matched before any send
  error?: string;
};

async function loadRecipients(opts: {
  artistSlug?: string | null;
  eventId?: string | null;
  channel: "email" | "sms";
}) {
  const admin = createAdminClient();
  const optColumn = opts.channel === "email" ? "email_opted_in" : "sms_opted_in";
  const contactColumn = opts.channel === "email" ? "email" : "phone";

  // Audience precedence (most specific wins):
  //   eventId  → fans who RSVPed to this event (for reminder blasts)
  //   artist   → fans who follow that artist
  //   (none)   → every opted-in fan (platform-wide announcement)
  let scopedIds: string[] | null = null;

  if (opts.eventId) {
    const { data } = await admin
      .from("event_rsvps")
      .select("fan_id")
      .eq("event_id", opts.eventId);
    scopedIds = (data ?? []).map((r) => r.fan_id as string);
    if (scopedIds.length === 0) return [];
  } else if (opts.artistSlug) {
    const { data } = await admin
      .from("fan_artist_following")
      .select("fan_id")
      .eq("artist_slug", opts.artistSlug);
    scopedIds = (data ?? []).map((f) => f.fan_id as string);
    if (scopedIds.length === 0) return [];
  }

  let query = admin
    .from("fans")
    .select("id, first_name, email, phone, sms_opted_in, email_opted_in, suspended, birth_date")
    .eq(optColumn, true)
    .eq("suspended", false)
    .not(contactColumn, "is", null);

  if (scopedIds) query = query.in("id", scopedIds);

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    first_name: string | null;
    email: string | null;
    phone: string | null;
    birth_date: string | null;
  }>;
}

/** Send an SMS to every opted-in adult fan through the active provider. */
export async function broadcastSms(params: {
  body: string;
  artistSlug?: string | null;
  eventId?: string | null;
}): Promise<BroadcastResult> {
  const result: BroadcastResult = { attempted: 0, sent: 0, failed: 0, recipients: 0 };

  const configError = smsConfigurationError();
  if (configError) return { ...result, error: configError };

  const recipients = await loadRecipients({
    artistSlug: params.artistSlug,
    eventId: params.eventId,
    channel: "sms",
  });
  result.recipients = recipients.length;
  if (recipients.length === 0) return result;

  const admin = createAdminClient();

  for (const fan of recipients) {
    if (!fan.phone) continue;
    if (!smsAgeAllowsSend(fan.birth_date)) continue;
    result.attempted += 1;
    try {
      const sent = await deliverSms({ to: fan.phone, body: params.body });
      if (sent.ok) {
        result.sent += 1;
      } else {
        result.failed += 1;
        if (sent.optOut) {
          await admin.from("fans").update({ sms_opted_in: false }).eq("id", fan.id);
        }
      }
    } catch (err) {
      console.error("broadcastSms: send failed for", fan.id, err);
      result.failed += 1;
    }
    // Throttle to stay under provider rate limits (1 msg/sec).
    await new Promise((r) => setTimeout(r, 250));
  }

  return result;
}

/**
 * Best-effort cleanup of a draft Mailchimp campaign. Used when content
 * upload or send fails partway through broadcastEmail() so we don't
 * leave stranded drafts in the dashboard. Failures here are logged and
 * swallowed — the original error is what matters to the caller.
 */
async function deleteMailchimpCampaign(
  base: string,
  authHeader: string,
  campaignId: string,
): Promise<void> {
  try {
    const res = await fetch(`${base}/campaigns/${campaignId}`, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });
    if (!res.ok) {
      console.warn(
        "broadcastEmail: cleanup DELETE returned",
        res.status,
        "for campaign",
        campaignId,
      );
    }
  } catch (err) {
    console.warn(
      "broadcastEmail: cleanup DELETE threw for campaign",
      campaignId,
      err,
    );
  }
}

/**
 * Send an email blast via Mailchimp Campaigns API — creates a one-off
 * regular campaign against the configured audience, sets plain-text + html
 * content, and fires it immediately.
 *
 * Note: this sends to every audience member (not just fans who logged in
 * via the app), since Mailchimp segments are owned on their side. For
 * app-only targeting we'd need a Mailchimp interest/group or tag-based
 * segment — wire-up deferred to a future phase.
 */
export async function broadcastEmail(params: {
  subject: string;
  body: string;
  fromName?: string;
  replyTo?: string;
}): Promise<BroadcastResult> {
  const result: BroadcastResult = { attempted: 0, sent: 0, failed: 0, recipients: 0 };

  const apiKey = process.env.MAILCHIMP_API_KEY;
  const server = process.env.MAILCHIMP_SERVER_PREFIX;
  const listId = process.env.MAILCHIMP_AUDIENCE_ID;
  if (!apiKey || !server || !listId) {
    return { ...result, error: "Mailchimp not configured" };
  }

  const authHeader = `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;
  const base = `https://${server}.api.mailchimp.com/3.0`;

  try {
    // 1) Create campaign
    const createRes = await fetch(`${base}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        type: "regular",
        recipients: { list_id: listId },
        settings: {
          subject_line: params.subject,
          title: `Fan Engage — ${params.subject}`.slice(0, 100),
          from_name: params.fromName ?? "Fan Engage",
          reply_to: params.replyTo ?? "no-reply@fanengage.app",
          preview_text: params.subject,
        },
      }),
    });
    if (!createRes.ok) {
      const detail = await createRes.json().catch(() => ({}));
      return { ...result, error: `Mailchimp create failed: ${createRes.status} ${JSON.stringify(detail).slice(0, 200)}` };
    }
    const { id: campaignId, emails_sent, recipients } = await createRes.json();
    const memberCount =
      (recipients?.segment_opts?.saved_segment_id ? 0 : recipients?.recipient_count) ??
      0;
    result.recipients = memberCount;
    result.attempted = emails_sent ?? memberCount;

    // 2) Set content (plain text + simple HTML wrapper)
    const contentRes = await fetch(`${base}/campaigns/${campaignId}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        plain_text: params.body,
        html: `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.5;color:#0f172a">
<h2 style="margin:0 0 16px;font-size:22px">${escapeHtml(params.subject)}</h2>
<div style="white-space:pre-wrap">${escapeHtml(params.body)}</div>
<p style="margin-top:32px;font-size:12px;color:#64748b">
  Sent via Fan Engage ·
  <a href="*|UNSUB|*" style="color:#64748b">Unsubscribe from Mailchimp</a> ·
  <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://fan-engage-pearl.vercel.app"}/unsubscribe?token=*|MERGE:UNSUB_TOKEN|*" style="color:#64748b">Unsubscribe from Fan Engage</a>
</p>
</body></html>`,
      }),
    });
    if (!contentRes.ok) {
      const detail = await contentRes.json().catch(() => ({}));
      await deleteMailchimpCampaign(base, authHeader, campaignId);
      return { ...result, error: `Mailchimp content failed: ${contentRes.status} ${JSON.stringify(detail).slice(0, 200)}` };
    }

    // 3) Send immediately
    const sendRes = await fetch(`${base}/campaigns/${campaignId}/actions/send`, {
      method: "POST",
      headers: { Authorization: authHeader },
    });
    if (!sendRes.ok) {
      const detail = await sendRes.json().catch(() => ({}));
      await deleteMailchimpCampaign(base, authHeader, campaignId);
      return { ...result, error: `Mailchimp send failed: ${sendRes.status} ${JSON.stringify(detail).slice(0, 200)}` };
    }
    result.sent = result.attempted;
    return result;
  } catch (err) {
    console.error("broadcastEmail error:", err);
    return { ...result, error: err instanceof Error ? err.message : String(err) };
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
