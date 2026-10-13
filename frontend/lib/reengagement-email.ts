/**
 * Day-3 and day-7 email for new fans who opted in.
 *
 * Off unless REENGAGEMENT_EMAIL_ENABLED is exactly "true". This flag is
 * separate from any Mailchimp campaign or broadcast setting.
 */

export const REENGAGEMENT_STEPS = [3, 7] as const;
export type ReengagementStep = (typeof REENGAGEMENT_STEPS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
/** One extra day so a missed daily run can still send. Windows do not overlap. */
const WINDOW_DAYS = 2;

export type ReengagementEnv = {
  REENGAGEMENT_EMAIL_ENABLED?: string;
};

export function isReengagementEmailEnabled(
  env: ReengagementEnv = {
    REENGAGEMENT_EMAIL_ENABLED: process.env.REENGAGEMENT_EMAIL_ENABLED,
  },
): boolean {
  return env.REENGAGEMENT_EMAIL_ENABLED?.trim().toLowerCase() === "true";
}

export function reengagementStepFor(
  createdAt: Date,
  now: Date,
  sent: ReadonlySet<number>,
): ReengagementStep | null {
  const ageDays = (now.getTime() - createdAt.getTime()) / DAY_MS;
  if (!Number.isFinite(ageDays) || ageDays < 0) return null;
  if (ageDays >= 7 && ageDays < 7 + WINDOW_DAYS && !sent.has(7)) return 7;
  if (ageDays >= 3 && ageDays < 3 + WINDOW_DAYS && !sent.has(3)) return 3;
  return null;
}

export type ReengagementCandidate = {
  createdAt: string;
  emailOptedIn: boolean;
  suspended: boolean;
  isInternal: boolean;
  email: string | null;
  unsubscribeToken: string | null;
  sentSteps: readonly number[];
};

/** Null when this fan should not get a re-engagement email right now. */
export function dueReengagementStep(
  candidate: ReengagementCandidate,
  now: Date,
): ReengagementStep | null {
  if (!candidate.emailOptedIn || candidate.suspended || candidate.isInternal) return null;
  if (!candidate.email?.trim() || !candidate.unsubscribeToken?.trim()) return null;
  const created = new Date(candidate.createdAt);
  if (Number.isNaN(created.getTime())) return null;
  return reengagementStepFor(created, now, new Set(candidate.sentSteps));
}

function safeFirstName(firstName: string | null): string | null {
  if (!firstName) return null;
  const cleaned = firstName.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 40);
  return cleaned || null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function reengagementMessage(input: {
  step: ReengagementStep;
  firstName: string | null;
  appUrl: string;
  unsubscribeToken: string;
}): { subject: string; text: string; html: string } {
  const name = safeFirstName(input.firstName);
  const greeting = name ? `Hi ${name},` : "Hi,";
  const home = input.appUrl.replace(/\/$/, "");
  const unsub = `${home}/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  const subject =
    input.step === 3
      ? "Your Fan Engage account is ready"
      : "A week later — the community is still here";
  const lead =
    input.step === 3
      ? "You joined a few days ago. Come back to see the community, rewards, and what is new."
      : "It has been about a week since you joined Fan Engage. Come back and pick up where you left off.";

  const text = `${greeting}

${lead}

Open Fan Engage: ${home}/

If you would rather not get these emails, unsubscribe: ${unsub}

Fan Engage`;

  const htmlName = name ? escapeHtml(name) : "";
  const htmlGreeting = htmlName ? `Hi ${htmlName},` : "Hi,";
  const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;line-height:1.55;color:#0f172a">
<p>${htmlGreeting}</p>
<p>${escapeHtml(lead)}</p>
<p style="margin:24px 0"><a href="${escapeHtml(home)}/" style="background:#0f172a;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Open Fan Engage</a></p>
<p style="margin-top:32px;font-size:12px;color:#64748b"><a href="${escapeHtml(unsub)}" style="color:#64748b">Unsubscribe</a></p>
</body></html>`;

  return { subject, text, html };
}
