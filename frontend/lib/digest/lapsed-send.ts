import {
  mailchimpShellHtml,
  mailchimpShellText,
  sendTransactionalBatch,
  transactionalProvider,
  type TransactionalBatchSpec,
  type TransactionalProvider,
  type TransactionalRecipient,
} from "../email/transactional.ts";
import type { LapsedEmailContent } from "./lapsed-email.ts";

/**
 * Delivery for the lapsed-fan nudge. The provider choice and both send
 * paths (Mandrill per-message, or Mailchimp merge-field + static segment +
 * one campaign) live in lib/email/transactional.ts, shared with the Monday
 * team brief; this module only names the nudge's merge fields, segment and
 * campaign subject, and maps fan ids to outcomes.
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

export type LapsedProvider = TransactionalProvider;

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
  return transactionalProvider(env);
}

const LAPSED_SPEC: TransactionalBatchSpec = {
  mailchimp: {
    mergeHtml: LAPSED_MERGE_HTML,
    mergeText: LAPSED_MERGE_TEXT,
    segmentName: LAPSED_SEGMENT_NAME,
    subject: LAPSED_CAMPAIGN_SUBJECT,
    title: "Fan Engage Lapsed Nudge",
    templateHtml: lapsedCampaignTemplateHtml(),
    templateText: lapsedCampaignTemplatePlainText(),
  },
  tags: ["weekly-digest", "lapsed-nudge"],
};

/** Send the whole batch through whichever provider is configured. */
export async function sendLapsedBatch(
  recipients: readonly LapsedRecipient[],
  env: Env = process.env,
): Promise<LapsedBatchResult> {
  const mapped: TransactionalRecipient[] = recipients.map((r) => ({
    id: r.fanId,
    email: r.email,
    // "there" is the copy fallback, not a name — never write it to FNAME.
    name: r.firstName && r.firstName !== "there" ? r.firstName : "",
    subject: r.content.subject,
    html: r.content.html,
    text: r.content.text,
  }));
  const result = await sendTransactionalBatch(mapped, LAPSED_SPEC, env);
  return {
    provider: result.provider,
    outcomes: result.outcomes.map((o) => ({ fanId: o.id, ok: o.ok, ...(o.error ? { error: o.error } : {}) })),
    campaignId: result.campaignId,
    error: result.error,
  };
}

/** Campaign shell; the per-fan body is the *|LAPSEDHTML|* merge value. */
export function lapsedCampaignTemplateHtml(): string {
  return mailchimpShellHtml(LAPSED_CAMPAIGN_SUBJECT, LAPSED_MERGE_HTML);
}

export function lapsedCampaignTemplatePlainText(): string {
  return mailchimpShellText(LAPSED_MERGE_TEXT);
}
