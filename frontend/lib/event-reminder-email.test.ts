import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEventReminderEmail,
  eventReminderSms,
  reminderClaimOutcome,
  selectReminderEmailRecipients,
  type ReminderEvent,
  type ReminderFanRow,
} from "./event-reminder-email.ts";

const EVENT: ReminderEvent = {
  id: "event-1",
  title: "Listening Party",
  detail: "Doors at 7.",
  location: "The Ryman",
  url: "https://example.com/party",
  artist_name: "RaeLynn",
};

const APP_URL = "https://www.fanengagepro.com";

function fan(over: Partial<ReminderFanRow> = {}): ReminderFanRow {
  return {
    id: "fan-1",
    email: "sam@example.com",
    first_name: "Sam",
    email_opted_in: true,
    suspended: false,
    is_internal: false,
    unsubscribe_token: "unsub-1",
    ...over,
  };
}

describe("selectReminderEmailRecipients", () => {
  it("keeps a fan who RSVPed and may be emailed", () => {
    const out = selectReminderEmailRecipients(["fan-1"], [fan()]);
    assert.deepEqual(out.map((f) => f.id), ["fan-1"]);
  });

  it("never includes a fan who did not RSVP, even when opted in", () => {
    const out = selectReminderEmailRecipients(["fan-1"], [fan(), fan({ id: "fan-2", email: "b@example.com" })]);
    assert.deepEqual(out.map((f) => f.id), ["fan-1"]);
  });

  it("returns nobody when nobody RSVPed", () => {
    assert.deepEqual(selectReminderEmailRecipients([], [fan()]), []);
  });

  it("drops fans who have not opted in to email", () => {
    assert.deepEqual(selectReminderEmailRecipients(["fan-1"], [fan({ email_opted_in: false })]), []);
  });

  it("drops suspended fans", () => {
    assert.deepEqual(selectReminderEmailRecipients(["fan-1"], [fan({ suspended: true })]), []);
  });

  it("drops internal and test fans", () => {
    assert.deepEqual(selectReminderEmailRecipients(["fan-1"], [fan({ is_internal: true })]), []);
  });

  it("drops fans with no email address", () => {
    assert.deepEqual(selectReminderEmailRecipients(["fan-1"], [fan({ email: null })]), []);
    assert.deepEqual(selectReminderEmailRecipients(["fan-1"], [fan({ email: "   " })]), []);
  });

  it("drops fans with no unsubscribe token, so every email can carry the link", () => {
    assert.deepEqual(selectReminderEmailRecipients(["fan-1"], [fan({ unsubscribe_token: null })]), []);
  });

  it("treats missing flags as not allowed", () => {
    const loose = { id: "fan-1", email: "sam@example.com", first_name: null, unsubscribe_token: "t" } as ReminderFanRow;
    assert.deepEqual(selectReminderEmailRecipients(["fan-1"], [loose]), []);
  });

  it("sends one email per fan even when a row comes back twice", () => {
    const out = selectReminderEmailRecipients(["fan-1", "fan-1"], [fan(), fan()]);
    assert.equal(out.length, 1);
  });

  it("does not change the arrays it is given", () => {
    const ids = Object.freeze(["fan-1"]);
    const fans = Object.freeze([Object.freeze(fan())]);
    assert.doesNotThrow(() => selectReminderEmailRecipients(ids, fans));
  });
});

describe("buildEventReminderEmail", () => {
  const base = { event: EVENT, firstName: "Sam", appUrl: APP_URL, unsubscribeToken: "unsub 1" };

  it("says when the event starts for each kind", () => {
    assert.equal(buildEventReminderEmail({ ...base, kind: "reminder_24h" }).subject, "Reminder: Listening Party starts tomorrow");
    assert.equal(buildEventReminderEmail({ ...base, kind: "reminder_1h" }).subject, "Reminder: Listening Party starts in 1 hour");
    assert.equal(buildEventReminderEmail({ ...base, kind: "manual" }).subject, "Reminder: Listening Party starts soon");
  });

  it("greets the fan, names the event and thanks them for the RSVP", () => {
    const { text } = buildEventReminderEmail({ ...base, kind: "reminder_24h" });
    assert.match(text, /^Hi Sam,/);
    assert.match(text, /RaeLynn's Listening Party starts tomorrow at The Ryman\./);
    assert.match(text, /Doors at 7\./);
    assert.match(text, /Details: https:\/\/example\.com\/party/);
    assert.match(text, /because you RSVPed/);
  });

  it("falls back to a plain greeting with no first name", () => {
    const { text } = buildEventReminderEmail({ ...base, firstName: null, kind: "manual" });
    assert.match(text, /^Hi,/);
  });

  it("carries the fan's own unsubscribe link in text and html", () => {
    const { text, html } = buildEventReminderEmail({ ...base, kind: "reminder_1h" });
    const link = "https://www.fanengagepro.com/unsubscribe?token=unsub%201";
    assert.ok(text.includes(link));
    assert.ok(html.includes(link));
  });

  it("escapes event and fan text in the html", () => {
    const { html } = buildEventReminderEmail({
      ...base,
      firstName: "<b>Sam</b>",
      event: { ...EVENT, title: "Rock & <Roll>", detail: "<script>x</script>" },
      kind: "manual",
    });
    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("<b>Sam</b>"));
    assert.ok(html.includes("Rock &amp; &lt;Roll&gt;"));
  });

  it("only links a web address", () => {
    const { html, text } = buildEventReminderEmail({
      ...base,
      event: { ...EVENT, url: "javascript:alert(1)" },
      kind: "manual",
    });
    assert.ok(!html.includes("javascript:"));
    assert.ok(!text.includes("javascript:"));
  });

  it("uses no em dashes", () => {
    for (const kind of ["reminder_24h", "reminder_1h", "manual"] as const) {
      const m = buildEventReminderEmail({ ...base, kind });
      assert.ok(!`${m.subject}${m.text}${m.html}`.includes(String.fromCharCode(0x2014)));
    }
  });
});

describe("eventReminderSms", () => {
  it("keeps the text copy the reminder already used", () => {
    assert.equal(
      eventReminderSms(EVENT, "reminder_24h"),
      "RaeLynn's Listening Party starts tomorrow at The Ryman. Link: https://example.com/party See you there!",
    );
    assert.equal(
      eventReminderSms({ ...EVENT, artist_name: null, location: null, url: null }, "reminder_1h"),
      "Your artist's Listening Party starts in 1 hour. See you there!",
    );
  });
});

describe("reminderClaimOutcome", () => {
  it("claims when the insert worked", () => {
    assert.equal(reminderClaimOutcome(null), "claimed");
  });
  it("reports already sent on a unique violation", () => {
    assert.equal(reminderClaimOutcome({ code: "23505" }), "already");
  });
  it("fails closed on any other error", () => {
    assert.equal(reminderClaimOutcome({ code: "42P01" }), "failed");
    assert.equal(reminderClaimOutcome({}), "failed");
  });
});
