import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESET_NEUTRAL_MESSAGE, buildResetEmail, buildResetLink } from "./password-reset-email.ts";

describe("password reset email", () => {
  it("links to our reset page with the token hash", () => {
    const link = buildResetLink("https://fans.example.com/", "abc123");
    assert.equal(link, "https://fans.example.com/reset-password?token_hash=abc123&type=recovery");
  });

  it("never puts an email address in the link", () => {
    const link = buildResetLink("https://fans.example.com", "abc123");
    assert.doesNotMatch(link, /@|email=/);
  });

  it("escapes the link in the HTML body", () => {
    const mail = buildResetEmail("Fan Engage Pro", 'https://x.test/?a="b"&c=<d>');
    assert.match(mail.html, /&quot;b&quot;&amp;c=&lt;d&gt;/);
    assert.equal(mail.subject, "Reset your Fan Engage Pro password");
    assert.match(mail.text, /Set a new password here: https:\/\/x\.test/);
  });

  it("neutral reply does not reveal whether an account exists", () => {
    assert.match(RESET_NEUTRAL_MESSAGE, /If an account exists/);
  });
});
