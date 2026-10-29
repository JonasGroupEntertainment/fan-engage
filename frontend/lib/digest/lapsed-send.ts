import {
  DIGEST_FROM_NAME,
  DIGEST_REPLY_TO,
  formatMailchimpFailure,
  subscriberHash,
} from "./outcomes.ts";
import type { LapsedEmailContent } from "./lapsed-email.ts";

/**
 * Delivery for the lapsed-fan nudge. Fan Engage has no general transactional
 * mailer; the weekly digest reaches fans through the Mailchimp Marketing API
 * (per-fan merge-field PUT, then one campaign). The nudge reuses that path
 * and adds the one thing the digest lacks — recipient targeting — so a nudge
 * campaign never lands in the whole audience's inbox:
 *
 *   Mailchimp path (MAILCHIMP_API_KEY + MAILCHIMP_SERVER_PREFIX +
 *   MAILCHIMP_AUDIENCE_ID, the same env the digest requires):
 *     1. PUT each fan's LAPSEDHTML / LAPSEDTEXT merge fields.
 *     2. PATCH the static segment (tag) named LAPSED_SEGMENT_NAME so its
 *        members are exactly this run's recipients (replaces last run's).
 *     3. POST one campaign whose recipients are that saved segment, whose
 *        body is *|LAPSEDHTML|*, and send it.
 *
 *   Mandrill path (MANDRILL_API_KEY, the key lib/applications/notify.ts
 *   already uses for invite email): one transactional message per fan.
 *   Preferred when configured — no audience setup, per-recipient HTML,
 *   no merge-field length cap. Nothing in the launch env sets it today.
 *
 * One-time Mailchimp audience setup (same place DIGESTHTML lives):
 *   Audience → Settings → Audience fields and *|MERGE|* tags → add
 *   "Lapsed HTML" (tag LAPSEDHTML, type Text) and "Lapsed text"
 *   (tag LAPSEDTEXT, type Text). The segment is created on first run.
 */

export const LAPSED_MERGE_HTML = "LAPSEDHTML";
export const LAPSED_MERGE_TEXT = "LAPSEDTEXT";
export const LAPSED_SEGMENT_NAME = "lapsed-nudge";
export const LAPSED_CAMPAIGN_SUBJECT = "It's been a minute";
// Same sender identity as the weekly digest campaign (lib/digest/send.ts).
const CAMPAIGN_FROM_NAME = DIGEST_FROM_NAME;
const CAMPAIGN_REPLY_TO = DIGEST_REPLY_TO;

export type LapsedProvider = "mandrill" | "mailchimp";

export type LapsedRecipient = {
  fanId: string;
  email: string;
  firstName: string;
  content: LapsedEmailContent;
};

export type LapsedSendOutcome = {
  fanId: string;
  ok: boolean;
  error?: string;
};

export type LapsedBatchResult = {
  provider: LapsedProvider | null;
  outcomes: LapsedSendOutcome[];
  /** Mailchimp path only. */
  campaignId: string | null;
  /** A failure that stopped every send (config, segment, campaign). */
  error: string | null;
};

type Env = Record<string, string | undefined>;

/** Which provider a send would use, or null with the reason it cannot. */
export function lapsedProvider(env: Env = process.env): {
  provider: LapsedProvider | null;
  reason: string | null;
} {
  if (env.MANDRILL_API_KEY?.trim()) return { provider: "mandrill", reason: null };
  const missing = ["MAILCHIMP_API_KEY", "MAILCHIMP_SERVER_PREFIX", "MAILCHIMP_AUDIENCE_ID"].filter(
    (name) => !env[name]?.trim(),
  );
  if (missing.length === 0) return { provider: "mailchimp", reason: null };
  return {
    provider: null,
    reason: `No email provider: set MANDRILL_API_KEY, or ${missing.join(", ")}`,
  };
}

/** Send the whole batch through whichever provider is configured. */
export async function sendLapsedBatch(
  recipients: readonly LapsedRecipient[],
  env: Env = process.env,
): Promise<LapsedBatchResult> {
  const { provider, reason } = lapsedProvider(env);
  if (!provider) return { provider: null, outcomes: [], campaignId: null, error: reason };
  if (recipients.length === 0) return { provider, outcomes: [], campaignId: null, error: null };
  if (provider === "mandrill") return sendViaMandrill(recipients, env);
  return sendViaMailchimp(recipients, env);
}

// ── Mandrill ────────────────────────────────────────────────────────────────

async function sendViaMandrill(
  recipients: readonly LapsedRecipient[],
  env: Env,
): Promise<LapsedBatchResult> {
  const key = env.MANDRILL_API_KEY as string;
  const outcomes: LapsedSendOutcome[] = [];
  for (const r of recipients) {
    try {
      const res = await fetch("https://mandrillapp.com/api/1.0/messages/send.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          message: {
            subject: r.content.subject,
            text: r.content.text,
            html: r.content.html,
            from_email: env.MANDRILL_FROM_EMAIL ?? CAMPAIGN_REPLY_TO,
            from_name: env.MANDRILL_FROM_NAME ?? CAMPAIGN_FROM_NAME,
            to: [{ email: r.email, name: r.firstName || undefined, type: "to" }],
            track_opens: true,
            track_clicks: false,
            tags: ["weekly-digest", "lapsed-nudge"],
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        outcomes.push({ fanId: r.fanId, ok: false, error: `Mandrill ${res.status}: ${body.slice(0, 200)}` });
        continue;
      }
      const results = (await res.json()) as Array<{ status?: string; reject_reason?: string | null }>;
      const first = Array.isArray(results) ? results[0] : undefined;
      const accepted = first?.status === "sent" || first?.status === "queued" || first?.status === "scheduled";
      outcomes.push(
        accepted
          ? { fanId: r.fanId, ok: true }
          : { fanId: r.fanId, ok: false, error: `Mandrill status ${first?.status ?? "unknown"}${first?.reject_reason ? ` (${first.reject_reason})` : ""}` },
      );
    } catch (err) {
      outcomes.push({ fanId: r.fanId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { provider: "mandrill", outcomes, campaignId: null, error: null };
}

// ── Mailchimp Marketing (merge fields + tagged segment + campaign) ───────────

type Mailchimp = { base: string; auth: string; listId: string };

function mailchimp(env: Env): Mailchimp {
  const apiKey = env.MAILCHIMP_API_KEY as string;
  const server = env.MAILCHIMP_SERVER_PREFIX as string;
  const listId = env.MAILCHIMP_AUDIENCE_ID as string;
  return {
    base: `https://${server}.api.mailchimp.com/3.0`,
    auth: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
    listId,
  };
}

async function mc(
  client: Mailchimp,
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  body?: unknown,
): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  const res = await fetch(`${client.base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: client.auth },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    return { ok: false, error: formatMailchimpFailure(`${method} ${path}`, res.status, await res.text()) };
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: true, json };
}

/** Find the static segment (tag) by name, creating it on first use. */
async function ensureSegment(client: Mailchimp): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const list = await mc(client, "GET", `/lists/${client.listId}/segments?type=static&count=1000&fields=segments.id,segments.name`);
  if (!list.ok) return list;
  const segments = ((list.json as { segments?: Array<{ id: number; name: string }> })?.segments ?? []);
  const found = segments.find((s) => s.name === LAPSED_SEGMENT_NAME);
  if (found) return { ok: true, id: found.id };
  const created = await mc(client, "POST", `/lists/${client.listId}/segments`, {
    name: LAPSED_SEGMENT_NAME,
    static_segment: [],
  });
  if (!created.ok) return created;
  const id = (created.json as { id?: number })?.id;
  if (typeof id !== "number") return { ok: false, error: "Mailchimp segment POST: missing id in response" };
  return { ok: true, id };
}

async function sendViaMailchimp(
  recipients: readonly LapsedRecipient[],
  env: Env,
): Promise<LapsedBatchResult> {
  const client = mailchimp(env);
  const outcomes: LapsedSendOutcome[] = [];
  const staged: LapsedRecipient[] = [];

  // 1. Per-fan merge fields. A fan whose PUT fails is reported and left
  //    out of the segment, so the campaign cannot reach them with stale
  //    content from an earlier run.
  for (const r of recipients) {
    const email = r.email.trim();
    const put = await mc(client, "PUT", `/lists/${client.listId}/members/${subscriberHash(email)}`, {
      email_address: email,
      status_if_new: "subscribed",
      merge_fields: {
        ...(r.firstName && r.firstName !== "there" ? { FNAME: r.firstName } : {}),
        [LAPSED_MERGE_HTML]: r.content.html,
        [LAPSED_MERGE_TEXT]: r.content.text,
      },
    });
    if (!put.ok) {
      outcomes.push({ fanId: r.fanId, ok: false, error: put.error });
      continue;
    }
    staged.push(r);
  }
  if (staged.length === 0) {
    return { provider: "mailchimp", outcomes, campaignId: null, error: null };
  }

  const fail = (error: string): LapsedBatchResult => ({
    provider: "mailchimp",
    outcomes: [...outcomes, ...staged.map((r) => ({ fanId: r.fanId, ok: false, error }))],
    campaignId: null,
    error,
  });

  // 2. Segment membership = exactly this run's recipients.
  const segment = await ensureSegment(client);
  if (!segment.ok) return fail(segment.error);
  const patched = await mc(client, "PATCH", `/lists/${client.listId}/segments/${segment.id}`, {
    name: LAPSED_SEGMENT_NAME,
    static_segment: staged.map((r) => r.email.trim()),
  });
  if (!patched.ok) return fail(patched.error);

  // 3. One campaign to that segment.
  const created = await mc(client, "POST", `/campaigns`, {
    type: "regular",
    recipients: { list_id: client.listId, segment_opts: { saved_segment_id: segment.id } },
    settings: {
      subject_line: LAPSED_CAMPAIGN_SUBJECT,
      title: `Fan Engage Lapsed Nudge · ${new Date().toISOString().slice(0, 10)}`.slice(0, 100),
      from_name: CAMPAIGN_FROM_NAME,
      reply_to: CAMPAIGN_REPLY_TO,
      auto_footer: true,
      inline_css: false,
    },
  });
  if (!created.ok) return fail(created.error);
  const campaignId = (created.json as { id?: string })?.id;
  if (!campaignId) return fail("Mailchimp campaigns POST: missing id in response");

  const content = await mc(client, "PUT", `/campaigns/${campaignId}/content`, {
    html: lapsedCampaignTemplateHtml(),
    plain_text: lapsedCampaignTemplatePlainText(),
  });
  if (!content.ok) return fail(content.error);

  const sent = await mc(client, "POST", `/campaigns/${campaignId}/actions/send`);
  if (!sent.ok) return fail(sent.error);

  return {
    provider: "mailchimp",
    outcomes: [...outcomes, ...staged.map((r) => ({ fanId: r.fanId, ok: true }))],
    campaignId,
    error: null,
  };
}

/** Campaign shell; the per-fan body is the *|LAPSEDHTML|* merge value. */
export function lapsedCampaignTemplateHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${LAPSED_CAMPAIGN_SUBJECT}</title></head>
<body style="margin:0; padding:24px; background:#fff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px; margin:0 auto;">
    <p style="margin:0 0 24px 0; font-size:13px; color:#999; text-transform:uppercase; letter-spacing:0.08em;">Fan Engage</p>
    *|${LAPSED_MERGE_HTML}|*
    <p style="margin:32px 0 0 0; padding-top:16px; border-top:1px solid #eee; font-size:11px; color:#999;">
      You're getting this because you opted into Fan Engage email updates.
      <a href="*|UNSUB|*" style="color:#666;">Unsubscribe from all Fan Engage emails</a>.
    </p>
  </div>
</body>
</html>
  `.trim();
}

export function lapsedCampaignTemplatePlainText(): string {
  return `*|${LAPSED_MERGE_TEXT}|*

---
You're getting this because you opted into Fan Engage email updates.
Unsubscribe: *|UNSUB|*
`;
}
