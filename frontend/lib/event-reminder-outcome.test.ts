import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MANUAL_REMINDER_COOLDOWN_MS,
  REMINDER_INCOMPLETE_MARKER,
  describeReminderResult,
  manualReminderCutoffIso,
  type EventReminderResult,
} from "./event-reminder-outcome.ts";

function result(over: Partial<EventReminderResult> = {}): EventReminderResult {
  return {
    status: "sent",
    smsRecipients: 0,
    emailRecipients: 0,
    emailSkipped: 0,
    emailFailed: 0,
    emailConfigured: true,
    ...over,
  };
}

describe("manualReminderCutoffIso", () => {
  it("is five minutes before now", () => {
    assert.equal(MANUAL_REMINDER_COOLDOWN_MS, 5 * 60 * 1000);
    assert.equal(manualReminderCutoffIso(new Date("2026-11-22T12:05:00Z")), "2026-11-22T12:00:00.000Z");
  });
});

describe("describeReminderResult", () => {
  it("says how many went out", () => {
    assert.deepEqual(describeReminderResult(result({ emailRecipients: 12, smsRecipients: 1 })), {
      ok: true,
      message: "Reminder sent: 12 emails and 1 text.",
    });
  });

  it("says how many were skipped and why in general terms", () => {
    assert.equal(
      describeReminderResult(result({ emailRecipients: 3, emailSkipped: 2 })).message,
      "Reminder sent: 3 emails and 0 texts. 2 fans who RSVPed were skipped for email because they have not opted in or cannot be emailed.",
    );
  });

  it("reports failed emails", () => {
    const out = describeReminderResult(result({ emailRecipients: 3, emailFailed: 1 }));
    assert.equal(out.ok, true);
    assert.match(out.message, /1 email failed to send\./);
  });

  it("is clear when email is not set up and nothing went out", () => {
    assert.deepEqual(describeReminderResult(result({ emailConfigured: false })), {
      ok: false,
      message: "Nothing was sent. Reminder email is not set up yet (the mail key is missing), and texts did not go out either.",
    });
  });

  it("mentions email is not set up when only texts went out", () => {
    const out = describeReminderResult(result({ emailConfigured: false, smsRecipients: 4 }));
    assert.equal(out.ok, true);
    assert.equal(out.message, "Reminder sent: 0 emails and 4 texts. Reminder email is not set up yet (the mail key is missing), so no emails went out.");
  });

  it("says when nobody could be reached", () => {
    const out = describeReminderResult(result({ emailSkipped: 2 }));
    assert.equal(out.ok, false);
    assert.match(out.message, /^Nothing was sent\. /);
    assert.match(out.message, /2 fans who RSVPed were skipped/);
  });

  it("explains a repeat click", () => {
    assert.deepEqual(describeReminderResult(result({ status: "recent_manual" })), {
      ok: false,
      message: "A reminder for this event was already sent in the last 5 minutes, so this one was not sent. Wait a few minutes if you mean to send another.",
    });
  });

  it("explains a reminder that could not be recorded", () => {
    const out = describeReminderResult(result({ status: "not_recorded" }));
    assert.equal(out.ok, false);
    assert.equal(out.message, "The reminder was not sent because it could not be recorded. Please try again.");
  });

  it("explains a scheduled reminder that already went", () => {
    assert.equal(describeReminderResult(result({ status: "already" })).ok, false);
  });

  it("marks an unfinished run without an em dash", () => {
    assert.match(REMINDER_INCOMPLETE_MARKER, /^incomplete/);
    assert.ok(!REMINDER_INCOMPLETE_MARKER.includes(String.fromCharCode(0x2014)));
  });
});
