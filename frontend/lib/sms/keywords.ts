/**
 * Keyword sets used by both providers.
 *
 * Twilio's inbound route already treated STOP / STOPALL / UNSUB /
 * UNSUBSCRIBE / CANCEL / END / QUIT as opt-out, HELP / INFO as help, and
 * START / YES / UNSTOP as opt-in.
 *
 * Mailchimp's SMS Marketing help center adds OPTOUT, REVOKE, and the
 * non-English stop words (ARRET, HALTE, PARA, FEMA, DETENER) plus AIDE
 * for help. Those are recognized here so a reply to the Mailchimp 10DLC
 * updates the same fan flag.
 * https://mailchimp.com/help/about-sms-marketing/
 */

export type SmsKeyword = "stop" | "help" | "start" | "other";

const STOP_KEYWORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUB",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "OPTOUT",
  "REVOKE",
  "ARRET",
  "HALTE",
  "PARA",
  "FEMA",
  "DETENER",
]);

const HELP_KEYWORDS = new Set(["HELP", "INFO", "AIDE"]);

const START_KEYWORDS = new Set(["START", "YES", "UNSTOP"]);

export const SMS_STOP_REPLY =
  "You're unsubscribed from Fan Engage. Reply START to opt back in. Reply HELP for help.";

export const SMS_START_REPLY =
  "You're back in for Fan Engage updates. Reply STOP anytime to opt out.";

export function smsHelpReply(supportEmail: string): string {
  return `Fan Engage: artist alerts + fan rewards. Msg & data rates may apply. Reply STOP to opt out. Support: ${supportEmail}`;
}

/** First word, letters only, so "STOP." and "stop please" both count. */
export function smsKeywordToken(body: string): string {
  const first = body.trim().toUpperCase().split(/\s+/)[0] ?? "";
  return first.replace(/[^A-Z]/g, "");
}

export function classifySmsKeyword(body: string): SmsKeyword {
  const token = smsKeywordToken(body);
  if (STOP_KEYWORDS.has(token)) return "stop";
  if (HELP_KEYWORDS.has(token)) return "help";
  if (START_KEYWORDS.has(token)) return "start";
  return "other";
}
