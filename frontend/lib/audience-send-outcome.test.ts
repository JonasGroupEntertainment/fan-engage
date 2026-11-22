import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DUPLICATE_BROADCAST_MESSAGE,
  DUPLICATE_CAMPAIGN_MESSAGE,
  DUPLICATE_SEND_WINDOW_MS,
  describeAudienceSend,
  describeEmailOutcome,
  describeInAppOutcome,
  describeSmsOutcome,
  duplicateSendCutoffIso,
  type EmailOutcome,
  type SmsOutcome,
} from "./audience-send-outcome.ts";

function email(over: Partial<EmailOutcome> = {}): EmailOutcome {
  return { configured: true, chosen: 0, sent: 0, failed: 0, skipped: 0, error: null, ...over };
}

function sms(over: Partial<SmsOutcome> = {}): SmsOutcome {
  return { recipients: 0, sent: 0, failed: 0, ...over };
}

const EM_DASH = String.fromCharCode(8212);

describe("duplicateSendCutoffIso", () => {
  it("is five minutes before now", () => {
    assert.equal(DUPLICATE_SEND_WINDOW_MS, 5 * 60 * 1000);
    assert.equal(duplicateSendCutoffIso(new Date("2026-11-22T12:05:00Z")), "2026-11-22T12:00:00.000Z");
  });
});

describe("describeEmailOutcome", () => {
  it("says how many were sent, skipped and failed", () => {
    assert.equal(
      describeEmailOutcome(email({ chosen: 16, sent: 12, skipped: 3, failed: 1 })),
      "Email: 12 sent, 3 skipped because they have not opted in or cannot be emailed, 1 failed.",
    );
  });

  it("says plainly when email is not set up", () => {
    assert.equal(
      describeEmailOutcome(email({ configured: false })),
      "Email is not set up yet (the mail key is missing), so no emails were sent.",
    );
  });

  it("says when nobody matched", () => {
    assert.equal(describeEmailOutcome(email()), "Email: no fans matched your choice, so no emails were sent.");
  });

  it("says when the fans could not be read, without showing the raw error", () => {
    assert.equal(
      describeEmailOutcome(email({ error: "fans: timeout" })),
      "No emails were sent because the list of fans could not be read. Please try again.",
    );
  });
});

describe("stopped early", () => {
  it("says the email send ran out of time and how many were not emailed", () => {
    assert.equal(
      describeEmailOutcome(email({ chosen: 900, sent: 240, skipped: 10, failed: 0, notSent: 650 })),
      "Email: 240 sent, 10 skipped because they have not opted in or cannot be emailed, 0 failed. The send stopped early because it ran out of time. 650 of the chosen fans were not emailed.",
    );
  });

  it("says the text send ran out of time and how many were not texted", () => {
    assert.equal(
      describeSmsOutcome(sms({ recipients: 500, sent: 200, failed: 1, notSent: 299 })),
      "Texts: 200 sent, 1 failed. The send stopped early because it ran out of time. 299 of the chosen fans were not texted.",
    );
  });

  it("still says so when time ran out before any text went", () => {
    assert.equal(
      describeSmsOutcome(sms({ recipients: 5, notSent: 5 })),
      "Texts: 0 sent, 0 failed. The send stopped early because it ran out of time. 5 of the chosen fans were not texted.",
    );
  });
});

describe("describeSmsOutcome", () => {
  it("says how many texts were sent and failed", () => {
    assert.equal(describeSmsOutcome(sms({ recipients: 6, sent: 5, failed: 1 })), "Texts: 5 sent, 1 failed.");
  });

  it("says when no chosen fan can be texted", () => {
    assert.equal(
      describeSmsOutcome(sms()),
      "Texts: none of the chosen fans have opted in to texts, so none were sent.",
    );
  });

  it("gives the reason when texts could not go out", () => {
    assert.equal(
      describeSmsOutcome(sms({ error: "Promotional texts are paused" })),
      "No texts were sent: Promotional texts are paused",
    );
  });
});

describe("describeInAppOutcome", () => {
  it("counts fans", () => {
    assert.equal(describeInAppOutcome(1), "In-app notice: 1 fan.");
    assert.equal(describeInAppOutcome(40), "In-app notice: 40 fans.");
  });
});

describe("describeAudienceSend", () => {
  it("lists each channel that was asked for, in order", () => {
    assert.deepEqual(
      describeAudienceSend({
        email: email({ chosen: 2, sent: 2 }),
        sms: sms({ recipients: 1, sent: 1 }),
        inApp: 3,
      }),
      {
        ok: true,
        lines: [
          "Email: 2 sent, 0 skipped because they have not opted in or cannot be emailed, 0 failed.",
          "Texts: 1 sent, 0 failed.",
          "In-app notice: 3 fans.",
        ],
      },
    );
  });

  it("is not ok when nothing went out on any channel", () => {
    const described = describeAudienceSend({ email: email({ configured: false }), sms: sms() });
    assert.equal(described.ok, false);
    assert.equal(described.lines.length, 2);
  });

  it("leaves out channels that were not asked for", () => {
    assert.deepEqual(describeAudienceSend({ sms: sms({ recipients: 2, sent: 2 }) }).lines, ["Texts: 2 sent, 0 failed."]);
  });
});

describe("duplicate messages", () => {
  it("are plain and carry no em dashes", () => {
    for (const message of [DUPLICATE_BROADCAST_MESSAGE, DUPLICATE_CAMPAIGN_MESSAGE]) {
      assert.ok(message.includes("5 minutes"));
    }
    assert.equal(
      DUPLICATE_BROADCAST_MESSAGE,
      "This same message went to these fans in the last 5 minutes, or is still going out, so it was not sent again. Wait a few minutes if you mean to send it again.",
    );
    for (const message of [DUPLICATE_BROADCAST_MESSAGE, DUPLICATE_CAMPAIGN_MESSAGE]) {
      assert.ok(!message.includes(EM_DASH));
    }
  });
});
