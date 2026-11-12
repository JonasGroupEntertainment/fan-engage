import {
  DIGEST_FROM_NAME,
  DIGEST_REPLY_TO,
  formatMailchimpFailure,
  subscriberHash,
} from "../digest/outcomes.ts";

/**
 * Per-recipient email with a provider choice. The lapsed-fan nudge
 * (lib/digest/lapsed-send.ts) uses `sendTransactionalBatch` (either
 * provider); the Monday team brief (lib/team-brief/send.ts) uses
 * `sendMandrillBatch` only, because the Mailchimp path enrols every
 * recipient in the fan audience. Fan Engage has no general transactional
 * mailer; the two paths are:
 *
 *   Mandrill (MANDRILL_API_KEY — the key lib/applications/notify.ts uses
 *   for invite email): one transactional message per recipient, with its
 *   own subject. Preferred when configured.
 *
 *   Mailchimp Marketing (MAILCHIMP_API_KEY + MAILCHIMP_SERVER_PREFIX +
 *   MAILCHIMP_AUDIENCE_ID, the env the weekly digest requires):
 *     1. PUT each recipient's HTML / text into two merge fields.
 *     2. PATCH a static segment (tag) so its members are exactly this
 *        run's recipients (replaces last run's).
 *     3. POST one campaign to that segment whose body is the HTML merge
 *        tag, and send it. The subject is campaign-wide, so a caller
 *        passes one `subject` for the whole batch here.
 *
 * One-time Mailchimp audience setup per caller: Audience → Settings →
 * Audience fields and *|MERGE|* tags → add the two Text fields named in
 * the caller's `MailchimpBatchSpec` (LAPSEDHTML / LAPSEDTEXT for the
 * nudge). The segment is created on first run.
 */

export type TransactionalProvider = "mandrill" | "mailchimp";

export type TransactionalRecipient = {
  /** Caller's key for the outcome (fan id, team member id). */
  id: string;
  email: string;
  /** Display name for the To header / FNAME. Empty string to omit. */
  name: string;
  subject: string;
  html: string;
  text: string;
};

export type TransactionalOutcome = {
  id: string;
  ok: boolean;
  error?: string;
};

export type TransactionalBatchResult = {
  provider: TransactionalProvider | null;
  outcomes: TransactionalOutcome[];
  /** Mailchimp path only. */
  campaignId: string | null;
  /** A failure that stopped every send (config, segment, campaign). */
  error: string | null;
};

export type MailchimpBatchSpec = {
  /** Merge tag that carries each recipient's HTML body. */
  mergeHtml: string;
  /** Merge tag that carries each recipient's plain-text body. */
  mergeText: string;
  /** Static segment (tag) name; replaced with this run's recipients. */
  segmentName: string;
  /** Campaign-wide subject (Mailchimp cannot vary it per recipient). */
  subject: string;
  /** Campaign title prefix; the run date is appended. */
  title: string;
  /** Campaign shells whose body is the merge tag. */
  templateHtml: string;
  templateText: string;
};

export type TransactionalBatchSpec = {
  mailchimp: MailchimpBatchSpec;
  /** Mandrill message tags, for reporting in the Mandrill dashboard. */
  tags: readonly string[];
};

type Env = Record<string, string | undefined>;

export const MAILCHIMP_PROVIDER_ENV = [
  "MAILCHIMP_API_KEY",
  "MAILCHIMP_SERVER_PREFIX",
  "MAILCHIMP_AUDIENCE_ID",
] as const;

/** Which provider a send would use, or null with the reason it cannot. */
export function transactionalProvider(env: Env = process.env): {
  provider: TransactionalProvider | null;
  reason: string | null;
} {
  if (env.MANDRILL_API_KEY?.trim()) return { provider: "mandrill", reason: null };
  const missing = MAILCHIMP_PROVIDER_ENV.filter((name) => !env[name]?.trim());
  if (missing.length === 0) return { provider: "mailchimp", reason: null };
  return {
    provider: null,
    reason: `No email provider: set MANDRILL_API_KEY, or ${missing.join(", ")}`,
  };
}

/** Send the whole batch through whichever provider is configured. */
export async function sendTransactionalBatch(
  recipients: readonly TransactionalRecipient[],
  spec: TransactionalBatchSpec,
  env: Env = process.env,
): Promise<TransactionalBatchResult> {
  const { provider, reason } = transactionalProvider(env);
  if (!provider) return { provider: null, outcomes: [], campaignId: null, error: reason };
  if (recipients.length === 0) return { provider, outcomes: [], campaignId: null, error: null };
  if (provider === "mandrill") return sendViaMandrill(recipients, spec, env);
  return sendViaMailchimp(recipients, spec.mailchimp, env);
}

/**
 * Standard campaign shell for the Mailchimp path: the per-recipient body
 * is the HTML merge value; the footer carries the audience unsubscribe.
 */
export function mailchimpShellHtml(subject: string, mergeHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${escapeHtmlText(subject)}</title></head>
<body style="margin:0; padding:24px; background:#fff; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px; margin:0 auto;">
    <p style="margin:0 0 24px 0; font-size:13px; color:#999; text-transform:uppercase; letter-spacing:0.08em;">Fan Engage</p>
    *|${mergeHtml}|*
    <p style="margin:32px 0 0 0; padding-top:16px; border-top:1px solid #eee; font-size:11px; color:#999;">
      You're getting this because you opted into Fan Engage email updates.
      <a href="*|UNSUB|*" style="color:#666;">Unsubscribe from all Fan Engage emails</a>.
    </p>
  </div>
</body>
</html>
  `.trim();
}

export function mailchimpShellText(mergeText: string): string {
  return `*|${mergeText}|*

---
You're getting this because you opted into Fan Engage email updates.
Unsubscribe: *|UNSUB|*
`;
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** True when the per-recipient (Mandrill) path is available. */
export function mandrillConfigured(env: Env = process.env): boolean {
  return Boolean(env.MANDRILL_API_KEY?.trim());
}

/**
 * Mandrill only — for staff-facing mail (the Monday team brief) that must
 * never fall back to Mailchimp: the Mailchimp path PUTs each recipient
 * into the fan marketing audience (`status_if_new: "subscribed"`) and
 * keys the body on the member, so a person on two teams would get one
 * brief. Returns provider null, sends nothing, when the key is unset.
 */
export async function sendMandrillBatch(
  recipients: readonly TransactionalRecipient[],
  tags: readonly string[],
  env: Env = process.env,
): Promise<TransactionalBatchResult> {
  if (!mandrillConfigured(env)) {
    return { provider: null, outcomes: [], campaignId: null, error: "MANDRILL_API_KEY is not set" };
  }
  if (recipients.length === 0) return { provider: "mandrill", outcomes: [], campaignId: null, error: null };
  return sendViaMandrill(recipients, { tags, mailchimp: undefined }, env);
}

// ── Mandrill ────────────────────────────────────────────────────────────────

async function sendViaMandrill(
  recipients: readonly TransactionalRecipient[],
  spec: { tags: readonly string[]; mailchimp?: MailchimpBatchSpec },
  env: Env,
): Promise<TransactionalBatchResult> {
  const key = env.MANDRILL_API_KEY as string;
  const outcomes: TransactionalOutcome[] = [];
  for (const r of recipients) {
    try {
      const res = await fetch("https://mandrillapp.com/api/1.0/messages/send.json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          message: {
            subject: r.subject,
            text: r.text,
            html: r.html,
            from_email: env.MANDRILL_FROM_EMAIL ?? DIGEST_REPLY_TO,
            from_name: env.MANDRILL_FROM_NAME ?? DIGEST_FROM_NAME,
            to: [{ email: r.email, name: r.name || undefined, type: "to" }],
            track_opens: true,
            track_clicks: false,
            tags: [...spec.tags],
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        outcomes.push({ id: r.id, ok: false, error: `Mandrill ${res.status}: ${body.slice(0, 200)}` });
        continue;
      }
      const results = (await res.json()) as Array<{ status?: string; reject_reason?: string | null }>;
      const first = Array.isArray(results) ? results[0] : undefined;
      const accepted = first?.status === "sent" || first?.status === "queued" || first?.status === "scheduled";
      outcomes.push(
        accepted
          ? { id: r.id, ok: true }
          : { id: r.id, ok: false, error: `Mandrill status ${first?.status ?? "unknown"}${first?.reject_reason ? ` (${first.reject_reason})` : ""}` },
      );
    } catch (err) {
      outcomes.push({ id: r.id, ok: false, error: err instanceof Error ? err.message : String(err) });
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
async function ensureSegment(
  client: Mailchimp,
  name: string,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const list = await mc(client, "GET", `/lists/${client.listId}/segments?type=static&count=1000&fields=segments.id,segments.name`);
  if (!list.ok) return list;
  const segments = ((list.json as { segments?: Array<{ id: number; name: string }> })?.segments ?? []);
  const found = segments.find((s) => s.name === name);
  if (found) return { ok: true, id: found.id };
  const created = await mc(client, "POST", `/lists/${client.listId}/segments`, {
    name,
    static_segment: [],
  });
  if (!created.ok) return created;
  const id = (created.json as { id?: number })?.id;
  if (typeof id !== "number") return { ok: false, error: "Mailchimp segment POST: missing id in response" };
  return { ok: true, id };
}

async function sendViaMailchimp(
  recipients: readonly TransactionalRecipient[],
  spec: MailchimpBatchSpec,
  env: Env,
): Promise<TransactionalBatchResult> {
  const client = mailchimp(env);
  const outcomes: TransactionalOutcome[] = [];
  const staged: TransactionalRecipient[] = [];

  // 1. Per-recipient merge fields. A recipient whose PUT fails is reported
  //    and left out of the segment, so the campaign cannot reach them with
  //    stale content from an earlier run.
  for (const r of recipients) {
    const email = r.email.trim();
    const put = await mc(client, "PUT", `/lists/${client.listId}/members/${subscriberHash(email)}`, {
      email_address: email,
      status_if_new: "subscribed",
      merge_fields: {
        ...(r.name ? { FNAME: r.name } : {}),
        [spec.mergeHtml]: r.html,
        [spec.mergeText]: r.text,
      },
    });
    if (!put.ok) {
      outcomes.push({ id: r.id, ok: false, error: put.error });
      continue;
    }
    staged.push(r);
  }
  if (staged.length === 0) {
    return { provider: "mailchimp", outcomes, campaignId: null, error: null };
  }

  const fail = (error: string): TransactionalBatchResult => ({
    provider: "mailchimp",
    outcomes: [...outcomes, ...staged.map((r) => ({ id: r.id, ok: false, error }))],
    campaignId: null,
    error,
  });

  // 2. Segment membership = exactly this run's recipients.
  const segment = await ensureSegment(client, spec.segmentName);
  if (!segment.ok) return fail(segment.error);
  const patched = await mc(client, "PATCH", `/lists/${client.listId}/segments/${segment.id}`, {
    name: spec.segmentName,
    static_segment: staged.map((r) => r.email.trim()),
  });
  if (!patched.ok) return fail(patched.error);

  // 3. One campaign to that segment.
  const created = await mc(client, "POST", `/campaigns`, {
    type: "regular",
    recipients: { list_id: client.listId, segment_opts: { saved_segment_id: segment.id } },
    settings: {
      subject_line: spec.subject,
      title: `${spec.title} · ${new Date().toISOString().slice(0, 10)}`.slice(0, 100),
      from_name: DIGEST_FROM_NAME,
      reply_to: DIGEST_REPLY_TO,
      auto_footer: true,
      inline_css: false,
    },
  });
  if (!created.ok) return fail(created.error);
  const campaignId = (created.json as { id?: string })?.id;
  if (!campaignId) return fail("Mailchimp campaigns POST: missing id in response");

  const content = await mc(client, "PUT", `/campaigns/${campaignId}/content`, {
    html: spec.templateHtml,
    plain_text: spec.templateText,
  });
  if (!content.ok) return fail(content.error);

  const sent = await mc(client, "POST", `/campaigns/${campaignId}/actions/send`);
  if (!sent.ok) return fail(sent.error);

  return {
    provider: "mailchimp",
    outcomes: [...outcomes, ...staged.map((r) => ({ id: r.id, ok: true }))],
    campaignId,
    error: null,
  };
}
