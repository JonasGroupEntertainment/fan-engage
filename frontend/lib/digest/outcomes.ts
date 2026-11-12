/**
 * Pure digest outcomes: Mailchimp subscriber hash, the digest_log status
 * the database actually allows, and the run-level message when no
 * campaign is sent.
 *
 * digest_log.status is check-constrained to
 * queued | rendered | merge_fields_updated | sent | skipped | error.
 * Attempt statuses like skipped_no_payload must be mapped before insert.
 */

import { createHash } from "node:crypto";

export type DigestAttemptStatus =
  | "rendered"
  | "merge_fields_updated"
  | "skipped_no_payload"
  | "skipped_subscriber_missing"
  | "error";

/** Values allowed by digest_log_status_check. */
export type DigestLogStatus =
  | "rendered"
  | "merge_fields_updated"
  | "skipped"
  | "error";

const MAILCHIMP_ERROR_MAX = 800;

export function digestLogStatus(status: DigestAttemptStatus): DigestLogStatus {
  switch (status) {
    case "merge_fields_updated":
      return "merge_fields_updated";
    case "rendered":
      return "rendered";
    case "skipped_no_payload":
    case "skipped_subscriber_missing":
      return "skipped";
    case "error":
      return "error";
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

/**
 * Mailchimp subscriber hash is MD5 of the trimmed, lowercased email.
 * The Marketing API rejects a PUT when the path hash does not match
 * email_address under that same normalization.
 */
export function subscriberHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

export function formatMailchimpFailure(
  action: string,
  status: number,
  raw: string,
): string {
  return clip(`Mailchimp ${action} ${status}: ${mailchimpDetail(raw)}`, MAILCHIMP_ERROR_MAX);
}

/**
 * A run with candidates but zero merge-field updates is a failure only
 * when at least one fan actually errored. Fans skipped because they
 * follow nobody, or have no posts or events this week, are not a
 * Mailchimp outage — the campaign correctly does not send.
 *
 * Per-fan reasons are included so the digest_log run row (and the cron
 * response) name the cause instead of only the skip sentence.
 */
export function unsentCampaignError(input: {
  totalCandidates: number;
  errors: Array<{ fan_id: string; error: string }>;
}): string | null {
  if (input.totalCandidates === 0 || input.errors.length === 0) return null;
  const shown = input.errors
    .slice(0, 8)
    .map((entry) => `${entry.fan_id}: ${brief(entry.error)}`);
  const extra =
    input.errors.length > shown.length
      ? ` (+${input.errors.length - shown.length} more)`
      : "";
  return `No fans had merge fields successfully updated; skipping campaign send. ${shown.join("; ")}${extra}`;
}

function mailchimpDetail(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "(empty body)";
  try {
    const parsed = JSON.parse(trimmed) as {
      title?: unknown;
      detail?: unknown;
      errors?: unknown;
    };
    const parts: string[] = [];
    if (typeof parsed.title === "string" && parsed.title.trim()) {
      parts.push(parsed.title.trim());
    }
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      parts.push(parsed.detail.trim());
    }
    const fields = mailchimpFieldErrors(parsed.errors);
    if (fields) parts.push(fields);
    if (parts.length > 0) return parts.join(" — ");
  } catch {
    // Response was not JSON; keep the raw body.
  }
  return trimmed;
}

function mailchimpFieldErrors(errors: unknown): string | null {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const lines = errors
    .map((entry) => {
      if (typeof entry === "string") return entry;
      if (!entry || typeof entry !== "object") return "";
      const record = entry as { field?: unknown; message?: unknown };
      const field = typeof record.field === "string" ? record.field : "";
      const message = typeof record.message === "string" ? record.message : "";
      if (field && message) return `${field}: ${message}`;
      return field || message;
    })
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines.join("; ") : null;
}

function brief(error: string): string {
  const oneLine = error.replace(/\s+/g, " ").trim();
  return oneLine.length <= 180 ? oneLine : `${oneLine.slice(0, 179)}…`;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Sender identity shared by the weekly digest campaign and the lapsed nudge. */
export const DIGEST_FROM_NAME = "Fan Engage";
export const DIGEST_REPLY_TO = "no-reply@fanengage.app";
