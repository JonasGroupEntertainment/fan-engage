/**
 * What an event reminder run did, and the plain words an admin sees after
 * pressing "Send reminder now". Pure: no env, no Supabase, no imports.
 */

const MINUTE_MS = 60 * 1000;
const MANUAL_REMINDER_COOLDOWN_MINUTES = 5;

/** A second manual send for the same event inside this window is ignored. */
export const MANUAL_REMINDER_COOLDOWN_MS = MANUAL_REMINDER_COOLDOWN_MINUTES * MINUTE_MS;

/**
 * Written to event_reminders.error when a run starts and replaced when it
 * finishes. A row still carrying it means the run was cut short and some
 * fans may not have had the reminder.
 */
export const REMINDER_INCOMPLETE_MARKER = "incomplete: run did not finish";

export type EventReminderStatus =
  /** The run finished. Counts say what went out. */
  | "sent"
  /** This 24 hour or 1 hour reminder was already claimed. Nothing sent. */
  | "already"
  /** A manual reminder for the event was sent moments ago. Nothing sent. */
  | "recent_manual"
  /** The claim row could not be written. Nothing sent. */
  | "not_recorded";

export type EventReminderResult = {
  status: EventReminderStatus;
  smsRecipients: number;
  emailRecipients: number;
  /** Fans who RSVPed but may not be emailed. Returned, not stored. */
  emailSkipped: number;
  emailFailed: number;
  /** False when the per-fan mail key is missing. */
  emailConfigured: boolean;
  error?: string;
};

export function manualReminderCutoffIso(now: Date = new Date()): string {
  return new Date(now.getTime() - MANUAL_REMINDER_COOLDOWN_MS).toISOString();
}

const EMAIL_NOT_SET_UP = "Reminder email is not set up yet (the mail key is missing)";

const NOTHING_SENT_MESSAGES: Record<Exclude<EventReminderStatus, "sent">, string> = {
  already: "This reminder was already sent, so it was not sent again.",
  recent_manual: `A reminder for this event was already sent in the last ${MANUAL_REMINDER_COOLDOWN_MINUTES} minutes, so this one was not sent. Wait a few minutes if you mean to send another.`,
  not_recorded: "The reminder was not sent because it could not be recorded. Please try again.",
};

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function extraNotes(result: EventReminderResult): string[] {
  const { emailSkipped, emailFailed } = result;
  return [
    ...(emailSkipped > 0
      ? [`${count(emailSkipped, "fan")} who RSVPed ${emailSkipped === 1 ? "was" : "were"} skipped for email because they have not opted in or cannot be emailed.`]
      : []),
    ...(emailFailed > 0 ? [`${count(emailFailed, "email")} failed to send.`] : []),
  ];
}

function nothingSentMessage(result: EventReminderResult): string {
  if (!result.emailConfigured) {
    return `Nothing was sent. ${EMAIL_NOT_SET_UP}, and texts did not go out either.`;
  }
  const notes = extraNotes(result);
  const why = notes.length > 0 ? notes : ["Nobody who RSVPed can be emailed or texted right now."];
  return ["Nothing was sent.", ...why].join(" ");
}

/** Plain words for the admin screen. `ok` is false when nothing went out. */
export function describeReminderResult(result: EventReminderResult): { ok: boolean; message: string } {
  if (result.status !== "sent") return { ok: false, message: NOTHING_SENT_MESSAGES[result.status] };
  if (result.emailRecipients + result.smsRecipients === 0) {
    return { ok: false, message: nothingSentMessage(result) };
  }
  const parts = [
    `Reminder sent: ${count(result.emailRecipients, "email")} and ${count(result.smsRecipients, "text")}.`,
    ...(result.emailConfigured ? [] : [`${EMAIL_NOT_SET_UP}, so no emails went out.`]),
    ...extraNotes(result),
  ];
  return { ok: true, message: parts.join(" ") };
}
