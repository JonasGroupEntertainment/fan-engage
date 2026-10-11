import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FOUNDER_FALLBACK_NOTICE_KIND,
  FOUNDER_FALLBACK_NOTICE_URL,
  formatRenewalDate,
  formatStandardPrice,
  founderFallbackNotice,
} from "./founder-fallback-notice.ts";

describe("formatStandardPrice", () => {
  it("formats monthly and annual prices", () => {
    assert.equal(formatStandardPrice(999, "usd", "month"), "$9.99 a month");
    assert.equal(formatStandardPrice(9900, "usd", "year"), "$99.00 a year");
  });

  it("drops the interval when it is unknown", () => {
    assert.equal(formatStandardPrice(500, "usd", null), "$5.00");
  });

  it("returns null for a missing or bad amount", () => {
    assert.equal(formatStandardPrice(null, "usd", "month"), null);
    assert.equal(formatStandardPrice(-1, "usd", "month"), null);
  });
});

describe("formatRenewalDate", () => {
  it("formats an ISO date in UTC", () => {
    assert.equal(formatRenewalDate("2026-11-18T03:00:00.000Z"), "November 18, 2026");
  });

  it("returns null for a missing or bad date", () => {
    assert.equal(formatRenewalDate(null), null);
    assert.equal(formatRenewalDate("soon"), null);
  });
});

describe("founderFallbackNotice", () => {
  const base = {
    subscriptionId: "sub_123",
    communityName: "RaeLynn",
    unitAmount: 999,
    currency: "usd",
    interval: "month",
    renewsAtIso: "2026-11-18T00:00:00.000Z",
  };

  it("names the community, the new price and the date", () => {
    const n = founderFallbackNotice(base);
    assert.equal(n.kind, FOUNDER_FALLBACK_NOTICE_KIND);
    assert.equal(n.url, FOUNDER_FALLBACK_NOTICE_URL);
    assert.equal(n.title, "Your membership price is changing");
    assert.match(n.body, /founding-fan spots for RaeLynn filled up/);
    assert.match(n.body, /standard price of \$9\.99 a month starting November 18, 2026\./);
  });

  it("keys dedup on the subscription so a replay sends nothing new", () => {
    assert.equal(founderFallbackNotice(base).dedupKey, "founder-fallback:sub_123");
  });

  it("falls back to plain wording when price or date is unknown", () => {
    const n = founderFallbackNotice({ ...base, unitAmount: null, renewsAtIso: null });
    assert.match(n.body, /renew at the standard price starting with your next renewal\./);
  });

  it("uses no em dashes", () => {
    assert.doesNotMatch(founderFallbackNotice(base).body, /—/);
  });
});
