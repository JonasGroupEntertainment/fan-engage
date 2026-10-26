/**
 * Mailchimp delivery for the weekly digest.
 *
 * Pattern: per-fan personalization via merge fields.
 *   1. For each fan, PUT their merge fields (DIGESTHTML = rendered
 *      HTML, DIGESTTEXT = plain-text, plus any helper fields).
 *      Mailchimp dedupes via the subscriber_hash so this is upsert.
 *   2. After all fans are updated, POST a single campaign with a
 *      template that templates *|DIGESTHTML|*. Send to a SAVED
 *      SEGMENT (or ALL) — Mailchimp injects each recipient's merge
 *      values at send time.
 *
 * Why this and not Mandrill: keeps us inside Mailchimp Marketing API
 * with one API key (already configured for broadcast.ts). The merge-
 * field-with-HTML-block pattern works for V1 volume (a few hundred
 * fans) and avoids adding a new vendor.
 *
 * The Mailchimp audience needs DIGESTHTML and DIGESTTEXT custom
 * merge fields configured in advance — see docs/AI_INFRASTRUCTURE.md
 * Phase 4 setup.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  gatherDigestPayload,
  renderDigestPayload,
  summarizeAllCommunities,
  type DigestRecipient,
} from "@/lib/digest";
import {
  digestLogStatus,
  formatMailchimpFailure,
  subscriberHash,
  type DigestAttemptStatus,
} from "@/lib/digest/outcomes";

const MAILCHIMP_API_KEY = () => process.env.MAILCHIMP_API_KEY;
const MAILCHIMP_SERVER = () => process.env.MAILCHIMP_SERVER_PREFIX;
const MAILCHIMP_LIST = () => process.env.MAILCHIMP_AUDIENCE_ID;

/** Subject line for the campaign. Personalization happens via the
 *  template body via *|FNAME|* and *|DIGESTHTML|* merge tags. */
const CAMPAIGN_SUBJECT = "Your weekly Fan Engage roundup";
const CAMPAIGN_FROM_NAME = "Fan Engage";
const CAMPAIGN_REPLY_TO = "no-reply@fanengage.app";

/** Lower-bound on how many recipients we need for the campaign to be
 *  worth firing. If only 0-1 fan is eligible this week, we skip. */
const MIN_RECIPIENTS = 1;

interface SendOneResult {
  status: DigestAttemptStatus;
  /** Skip reason or failure detail. Stored on digest_log.error_message. */
  error?: string;
  /** Set when we successfully ran the renderer + summarizer. */
  htmlBody?: string;
  textBody?: string;
  payloadCommunities?: string[];
  payloadPostIds?: string[];
  aiSummaryCount?: number;
}

/**
 * Run the full prepare-merge-fields pipeline for one recipient.
 * Returns metadata the cron writes into digest_log.
 */
export async function prepareDigestForFan(
  recipient: DigestRecipient,
): Promise<SendOneResult> {
  try {
    // 1. Gather + summarize + render.
    const gathered = await gatherDigestPayload(recipient);
    if (!gathered.ok) {
      return { status: "skipped_no_payload", error: gathered.reason };
    }
    const payload = gathered.payload;

    await summarizeAllCommunities(payload);
    const { html, text } = renderDigestPayload(payload);

    const aiSummaryCount = payload.communities.filter((c) => c.vibe_summary).length;
    const payloadCommunities = payload.communities.map((c) => c.community_id);
    const payloadPostIds = payload.communities.flatMap((c) =>
      c.topPosts.map((p) => p.id),
    );

    // 2. PUT merge fields for this fan in Mailchimp.
    const apiKey = MAILCHIMP_API_KEY();
    const server = MAILCHIMP_SERVER();
    const listId = MAILCHIMP_LIST();
    if (!apiKey || !server || !listId) {
      const missing = [
        !apiKey ? "MAILCHIMP_API_KEY" : null,
        !server ? "MAILCHIMP_SERVER_PREFIX" : null,
        !listId ? "MAILCHIMP_AUDIENCE_ID" : null,
      ].filter((name): name is string => Boolean(name));
      return {
        status: "error",
        error: `Missing env: ${missing.join(", ")}`,
        htmlBody: html,
        textBody: text,
        payloadCommunities,
        payloadPostIds,
        aiSummaryCount,
      };
    }

    const email = recipient.email.trim();
    if (!email) {
      return {
        status: "error",
        error: "Fan email is blank",
        htmlBody: html,
        textBody: text,
        payloadCommunities,
        payloadPostIds,
        aiSummaryCount,
      };
    }

    // Hash must be md5(trim + lowercase). A mismatch makes Mailchimp
    // reject the member PUT before merge fields are written.
    const subHash = subscriberHash(email);
    const url = `https://${server}.api.mailchimp.com/3.0/lists/${listId}/members/${subHash}`;
    const auth = `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;

    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({
        email_address: email,
        status_if_new: "subscribed",
        merge_fields: {
          ...(recipient.first_name ? { FNAME: recipient.first_name } : {}),
          DIGESTHTML: html,
          DIGESTTEXT: text,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return {
        status: "error",
        error: formatMailchimpFailure("PUT member", res.status, body),
        htmlBody: html,
        textBody: text,
        payloadCommunities,
        payloadPostIds,
        aiSummaryCount,
      };
    }

    return {
      status: "merge_fields_updated",
      htmlBody: html,
      textBody: text,
      payloadCommunities,
      payloadPostIds,
      aiSummaryCount,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * After all fans have their merge fields set, fire a single campaign.
 * Mailchimp will deliver the template to every recipient with their own
 * merge values inlined. Returns the campaign id (saved on every
 * digest_log row that participated in this batch).
 */
export async function fireDigestCampaign(
  recipientCount: number,
): Promise<{ ok: true; campaignId: string } | { ok: false; error: string }> {
  if (recipientCount < MIN_RECIPIENTS) {
    return {
      ok: false,
      error: `Skipping campaign: only ${recipientCount} eligible recipient(s).`,
    };
  }

  const apiKey = MAILCHIMP_API_KEY();
  const server = MAILCHIMP_SERVER();
  const listId = MAILCHIMP_LIST();
  if (!apiKey || !server || !listId) {
    return {
      ok: false,
      error: "Mailchimp not configured — set MAILCHIMP_API_KEY, MAILCHIMP_SERVER_PREFIX, MAILCHIMP_AUDIENCE_ID.",
    };
  }

  const base = `https://${server}.api.mailchimp.com/3.0`;
  const auth = `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`;

  // 1. Create campaign targeting the whole audience. Mailchimp will only
  //    actually deliver to fans whose status is 'subscribed' AND whose
  //    DIGESTHTML merge field is non-empty for this run — but we depend
  //    on having only just-prepared fans in the audience. (For V1 we
  //    accept the simplification; a saved segment can be added later if
  //    we want stricter targeting.)
  const create = await fetch(`${base}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({
      type: "regular",
      recipients: { list_id: listId },
      settings: {
        subject_line: CAMPAIGN_SUBJECT,
        title: `Fan Engage Weekly Digest · ${new Date().toISOString().slice(0, 10)}`.slice(0, 100),
        from_name: CAMPAIGN_FROM_NAME,
        reply_to: CAMPAIGN_REPLY_TO,
        // Don't auto-resize images, don't auto-tweet, etc.
        auto_footer: true,
        inline_css: false,
      },
    }),
  });
  if (!create.ok) {
    return {
      ok: false,
      error: formatMailchimpFailure("campaigns POST", create.status, await create.text()),
    };
  }
  const campaign = (await create.json()) as { id?: string };
  if (!campaign.id) {
    return { ok: false, error: "Mailchimp campaigns POST: missing id in response" };
  }

  // 2. Set the campaign content. The HTML uses *|DIGESTHTML|* and
  //    *|FNAME|* merge tags so each recipient sees their own content.
  const setContent = await fetch(`${base}/campaigns/${campaign.id}/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({
      html: campaignTemplateHtml(),
      plain_text: campaignTemplatePlainText(),
    }),
  });
  if (!setContent.ok) {
    return {
      ok: false,
      error: formatMailchimpFailure(
        "campaigns content PUT",
        setContent.status,
        await setContent.text(),
      ),
    };
  }

  // 3. Send.
  const send = await fetch(`${base}/campaigns/${campaign.id}/actions/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
  });
  if (!send.ok) {
    return {
      ok: false,
      error: formatMailchimpFailure(
        "campaigns send POST",
        send.status,
        await send.text(),
      ),
    };
  }

  return { ok: true, campaignId: campaign.id };
}

/**
 * Mark a fan as having received this week's digest. Called after each
 * successful merge-field update so retries don't re-process. Also writes
 * the digest_log row capturing what was sent.
 */
export async function recordDigestSent(args: {
  fan_id: string;
  week_start: string;
  status: DigestAttemptStatus;
  campaign_id: string | null;
  html_body: string | null;
  text_body: string | null;
  ai_summary_count: number | null;
  payload_communities: string[] | null;
  payload_post_ids: string[] | null;
  error_message: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  // skipped_no_payload is not in digest_log_status_check. Map it to skipped
  // and keep the reason in error_message, or the upsert 400s and the only
  // row that lands is the run-level "no merge fields" message.
  const status = digestLogStatus(args.status);

  const { error } = await admin.from("digest_log").upsert(
    {
      fan_id: args.fan_id,
      week_start: args.week_start,
      sent_at: new Date().toISOString(),
      status,
      mailchimp_campaign_id: args.campaign_id,
      html_body: args.html_body,
      text_body: args.text_body,
      ai_summary_count: args.ai_summary_count,
      payload_communities: args.payload_communities,
      payload_post_ids: args.payload_post_ids,
      error_message: args.error_message,
    },
    { onConflict: "fan_id,week_start" },
  );
  if (error) {
    return { ok: false, error: `digest_log upsert failed: ${error.message}` };
  }

  // Update fans.last_digest_sent_at only on real-send statuses so retries
  // for errored / skipped runs don't lock us out for 6 days.
  if (status === "merge_fields_updated") {
    const { error: fanErr } = await admin
      .from("fans")
      .update({ last_digest_sent_at: new Date().toISOString() })
      .eq("id", args.fan_id);
    if (fanErr) {
      return {
        ok: false,
        error: `fans.last_digest_sent_at update failed: ${fanErr.message}`,
      };
    }
  }
  return { ok: true };
}

/** Master campaign template HTML. Uses *|DIGESTHTML|* and *|FNAME|*
 *  merge tags. Mailchimp will replace these per recipient at send time.
 *
 *  In the Mailchimp dashboard, you can replace this with a richer
 *  branded template (logo, header image, footer with unsubscribe link).
 *  This minimal version is the safe default if no template is set up. */
function campaignTemplateHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your weekly Fan Engage roundup</title></head>
<body style="margin:0; padding:24px; background:#fff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px; margin:0 auto;">
    <p style="margin:0 0 24px 0; font-size:13px; color:#999; text-transform:uppercase; letter-spacing:0.08em;">Fan Engage · Weekly Digest</p>
    *|DIGESTHTML|*
    <p style="margin:32px 0 0 0; padding-top:16px; border-top:1px solid #eee; font-size:11px; color:#999;">
      You're getting this because you opted into Fan Engage email updates.
      <a href="*|UNSUB|*" style="color:#666;">Unsubscribe from all Fan Engage emails</a>.
    </p>
  </div>
</body>
</html>
  `.trim();
}

function campaignTemplatePlainText(): string {
  return `*|DIGESTTEXT|*

---
You're getting this because you opted into Fan Engage email updates.
Unsubscribe: *|UNSUB|*
`;
}
