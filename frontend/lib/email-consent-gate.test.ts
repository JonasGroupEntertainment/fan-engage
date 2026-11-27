import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Wiring tests for marketing email consent. The rules themselves are in
 * marketing-consent.test.ts; these read the source of each place that
 * collects consent or sends marketing email and check it uses them.
 */

function read(relFromFrontend: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relFromFrontend}`, import.meta.url)), "utf8");
}

const CONSENT_FILTER = '.not(MARKETING_EMAIL_CONSENT_COLUMN, "is", null)';

describe("the join form asks for email consent with its own unticked box", () => {
  const wizard = read("app/onboarding/onboarding-wizard.tsx");

  it("starts the email box unticked", () => {
    assert.match(wizard, /const \[emailConsent, setEmailConsent\] = useState\(false\);/);
  });

  it("shows the consent wording beside the box", () => {
    assert.match(wizard, /checked=\{emailConsent\}/);
    assert.match(wizard, /<span>\{EMAIL_CONSENT_TEXT\}<\/span>/);
  });

  it("no longer opts in every fan who typed an email", () => {
    assert.doesNotMatch(wizard, /emailOptedIn: Boolean\(formState\.email\)/);
    assert.match(wizard, /emailConsent: Boolean\(formState\.email\) && emailConsent,/);
  });

  it("only adds a fan to the mailing list after the box was ticked", () => {
    // Arrange
    const calls = wizard.split('fetch("/api/fan-engage/mailchimp"').length - 1;
    const guarded = wizard.split("if (formState.email && emailConsent) {").length - 1;

    // Assert
    assert.equal(calls, 2);
    assert.equal(guarded, 2);
  });
});

describe("the join route records a tick and nothing else", () => {
  const route = read("app/api/fan-engage/onboard/route.ts");

  it("takes the opt-in from the consent rule, not from the old field", () => {
    assert.match(route, /emailJoinUpdates\(\s*payload\.emailConsent === true && Boolean\(user\.email\),/);
    assert.doesNotMatch(route, /Boolean\(payload\.emailOptedIn\)/);
  });

  it("records text consent only when texts were accepted this time", () => {
    assert.match(route, /\.\.\.\(smsOptedIn && !hasTextRecord \? smsConsentStamp\(now\) : \{\}\),/);
  });

  it("still saves the join when the consent columns do not exist yet", () => {
    assert.match(route, /isMissingMarketingConsentColumn\(updateErr\)/);
    assert.match(route, /omitMarketingConsent\(omitOptInTimestamps\(updates\)\)/);
  });
});

describe("the mailing list route", () => {
  const route = read("app/api/fan-engage/mailchimp/route.ts");

  it("uses the signed-in fan's own email, never a posted one", () => {
    assert.match(route, /const email = user\.email\?\.trim\(\);/);
    assert.doesNotMatch(route, /const \{ email,/);
  });

  it("adds only a fan with a recorded email consent", () => {
    // Arrange
    const check = route.indexOf("if (!hasRecordedEmailConsent(consentRow))");
    const send = route.indexOf('method: "PUT"');

    // Assert: the check comes before the request to Mailchimp.
    assert.notEqual(check, -1);
    assert.ok(check < send);
  });

  it("adds nobody when the consent record cannot be read", () => {
    assert.match(route, /if \(consentErr\) \{[\s\S]*?skipped: "no-email-consent"/);
  });
});

describe("every marketing email sender needs a recorded consent", () => {
  it("admin broadcast and campaign email", () => {
    assert.ok(read("lib/admin-audience.ts").includes(CONSENT_FILTER));
  });

  it("the day 3 and day 7 email", () => {
    assert.ok(read("app/api/cron/reengagement-email/route.ts").includes(CONSENT_FILTER));
  });

  it("the lapsed fan nudge", () => {
    assert.ok(read("lib/digest/lapsed-pass.ts").includes(CONSENT_FILTER));
  });

  it("the weekly digest, before any fan is processed", () => {
    // Arrange
    const route = read("app/api/cron/weekly-digest/route.ts");
    const filter = route.indexOf(CONSENT_FILTER);
    const firstUse = route.indexOf("summary.totalCandidates = recipients.length;");

    // Assert
    assert.notEqual(filter, -1);
    assert.ok(filter < firstUse);
    assert.match(route, /recipients = recipients\.filter\(\(r\) => allowed\.has\(r\.fan_id\)\);/);
  });

  it("the weekly digest checks consent in chunks, not one long request", () => {
    assert.match(read("app/api/cron/weekly-digest/route.ts"), /await pageAllIn<\{ id: string \}, string>\(/);
  });

  it("the weekly digest prepares nobody while its campaign is on hold", () => {
    // Arrange
    const route = read("app/api/cron/weekly-digest/route.ts");
    const hold = route.indexOf("const digestHold = digestCampaignHoldReason();");
    const campaign = route.indexOf("await fireDigestCampaign(");

    // Assert: the hold empties the list before any fan is prepared.
    assert.notEqual(hold, -1);
    assert.ok(hold < campaign);
    assert.match(route, /if \(digestHold\) \{[\s\S]*?recipients = \[\];/);
  });

  it("the digest campaign really does go to the whole list, which is why it is held", () => {
    assert.match(read("lib/digest/send.ts"), /recipients: \{ list_id/);
  });

  it("the streak and leaderboard reminder emails read the consent record", () => {
    assert.match(read("lib/fan-reminder-email-run.ts"), /email_opted_in, email_consent_at,/);
    assert.match(read("lib/fan-reminder-email.ts"), /if \(!hasRecordedEmailConsent\(fan\)\) return "no_recorded_consent";/);
  });
});

describe("an event reminder to a fan who RSVPed is not marketing", () => {
  it("keeps its existing rule and is not held for a consent record", () => {
    // Arrange
    const reminders = read("lib/reminders.ts");

    // Assert
    assert.match(reminders, /\.eq\("email_opted_in", true\)/);
    assert.equal(reminders.includes("MARKETING_EMAIL_CONSENT_COLUMN"), false);
  });
});

describe("a fan can change their mind", () => {
  it("settings has a marketing email switch that is on only with a record", () => {
    // Arrange
    const page = read("app/me/notifications/page.tsx");

    // Assert
    assert.match(page, /const marketingEmailOn = hasRecordedEmailConsent\(emailRow\);/);
    assert.match(page, /<EmailMarketingSwitch\s+initialOn=\{marketingEmailOn\}\s+hasEmail=\{hasEmail\}/);
  });

  it("turning it on needs a tick and records it on the server", () => {
    // Arrange
    const control = read("app/me/notifications/email-marketing-switch.tsx");
    const action = read("app/me/notifications/email-marketing-actions.ts");

    // Assert
    assert.match(control, /const \[ticked, setTicked\] = useState\(false\);/);
    assert.match(control, /disabled=\{!ticked \|\| pending\}/);
    assert.match(action, /\.update\(emailMarketingUpdates\(on\)\)\s*\.eq\("id", user\.id\)/);
  });

  it("turning texts on in settings records that consent and shows the wording", () => {
    assert.match(read("app/me/notifications/actions.ts"), /\.\.\.\(smsOptIn \? smsConsentStamp\(now\) : \{\}\),/);
    assert.match(read("app/me/notifications/preferences-form.tsx"), /Turning on SMS means: \{SMS_CONSENT_TEXT\}/);
  });
});

describe("fans the old form opted in are asked again", () => {
  it("the question shows on Fan Home only for those fans", () => {
    assert.match(read("components/fan-home-dashboard.tsx"), /<EmailReaskBanner \/>/);
    assert.match(read("components/email-reask-banner.tsx"), /if \(!needsEmailReask\(fan\)\) return null;/);
  });

  it("the box starts unticked and Save needs a tick", () => {
    // Arrange
    const prompt = read("components/email-reask-prompt.tsx");

    // Assert
    assert.match(prompt, /const \[ticked, setTicked\] = useState\(false\);/);
    assert.match(prompt, /disabled=\{!ticked \|\| pending\}/);
  });

  it("the thank you message follows what was saved, not what was pressed", () => {
    assert.match(read("components/email-reask-prompt.tsx"), /else setDone\(result\.agreed \? "yes" : "no"\);/);
  });

  it("settings lets such a fan stop all email before they answer", () => {
    assert.match(read("app/me/notifications/page.tsx"), /unconfirmed=\{needsEmailReask\(emailRow\)\}/);
    assert.match(read("app/me/notifications/email-marketing-switch.tsx"), /Stop all email/);
  });

  it("the answer is saved once, for the signed-in fan only", () => {
    // Arrange
    const action = read("app/email-consent-actions.ts");

    // Assert
    assert.match(action, /if \(!needsEmailReask\(fan\)\) return \{ ok: true/);
    assert.match(action, /\.update\(emailReaskUpdates\(agree\)\)\.eq\("id", user\.id\)/);
  });
});
