/**
 * Password reset email built from our own link, not Supabase's verify URL.
 * jonasgroup.com mail security opens every emailed link, which burns a
 * one-time token used on GET. Our link only carries the token hash; the reset
 * page verifies it when the user submits the new password. Pure module.
 */

export const RESET_NEUTRAL_MESSAGE =
  "If an account exists for that email, a reset link is on its way.";

export function buildResetLink(baseUrl: string, tokenHash: string): string {
  const url = new URL("/reset-password", baseUrl.replace(/\/+$/, "") + "/");
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildResetEmail(appName: string, link: string) {
  const subject = `Reset your ${appName} password`;
  const text = [
    `Someone asked to reset the password for your ${appName} account.`,
    "",
    `Set a new password here: ${link}`,
    "",
    "If you did not ask for this, you can ignore this email. Your password stays the same.",
  ].join("\n");
  const safeLink = escapeHtml(link);
  const html = `<p>Someone asked to reset the password for your ${escapeHtml(appName)} account.</p>
<p><a href="${safeLink}">Set a new password</a></p>
<p>If you did not ask for this, you can ignore this email. Your password stays the same.</p>`;
  return { subject, text, html };
}
