import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RAELYNN_VIP_ACCESS_DAYS,
  RAELYNN_VIP_CODE,
  RAELYNN_VIP_EXPIRES_AT,
  RAELYNN_VIP_MAX_USES,
  effectivePromoLimits,
  promoExpired,
  promoGrant,
  promoLimitReached,
  redeemSuccessMessage,
} from "./raelynn-vip-code.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const redeemTs = readRepo("../app/account/promo/actions.ts");
const migrationSql = readRepo("../../supabase/migrations/0076_raelynnvip_comp_cap.sql");
const accessSql = readRepo("../../supabase/migrations/0078_raelynnvip_seven_day_access.sql");
const premiumPage = readRepo("../app/premium/page.tsx");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("RAELYNNVIP limits", () => {
  it("caps uses at 10 and expiry at the end of 2026-12-31 UTC", () => {
    const limits = effectivePromoLimits({
      code: "raelynnvip",
      maxUses: null,
      expiresAt: null,
    });
    assert.equal(limits.maxUses, RAELYNN_VIP_MAX_USES);
    assert.equal(limits.expiresAt, new Date(RAELYNN_VIP_EXPIRES_AT).toISOString());
    assert.equal(limits.countRedemptions, true);
    assert.equal(RAELYNN_VIP_MAX_USES, 10);
    assert.equal(RAELYNN_VIP_CODE, "RAELYNNVIP");
  });

  it("keeps a tighter stored cap and an earlier stored expiry", () => {
    const limits = effectivePromoLimits({
      code: "RAELYNNVIP",
      maxUses: 4,
      expiresAt: "2026-06-01T00:00:00.000Z",
    });
    assert.equal(limits.maxUses, 4);
    assert.equal(limits.expiresAt, "2026-06-01T00:00:00.000Z");
  });

  it("pulls a later expiry and a higher max back to the cap", () => {
    const limits = effectivePromoLimits({
      code: "RAELYNNVIP",
      maxUses: 100,
      expiresAt: "2027-01-01T00:00:00.000Z",
    });
    assert.equal(limits.maxUses, 10);
    assert.equal(limits.expiresAt, new Date(RAELYNN_VIP_EXPIRES_AT).toISOString());
  });

  it("leaves other codes alone", () => {
    const limits = effectivePromoLimits({
      code: "OTHER",
      maxUses: null,
      expiresAt: null,
    });
    assert.equal(limits.maxUses, null);
    assert.equal(limits.expiresAt, null);
    assert.equal(limits.countRedemptions, false);
  });

  it("treats the code as valid through 2026-12-31 and expired the next instant", () => {
    const expiresAt = new Date(RAELYNN_VIP_EXPIRES_AT).toISOString();
    assert.equal(promoExpired(expiresAt, new Date(RAELYNN_VIP_EXPIRES_AT)), false);
    assert.equal(
      promoExpired(expiresAt, new Date(Date.parse(RAELYNN_VIP_EXPIRES_AT) + 1)),
      true,
    );
    assert.equal(promoLimitReached(9, 10), false);
    assert.equal(promoLimitReached(10, 10), true);
  });
});

describe("RAELYNNVIP redeem and migration", () => {
  it("redeem applies the cap and counts existing redemption rows", () => {
    assert.match(redeemTs, /effectivePromoLimits/);
    assert.match(redeemTs, /promo_code_redemptions/);
    assert.match(redeemTs, /count: "exact"/);
    assert.doesNotMatch(redeemTs, /delete\(\)/);
  });

  it("migration sets the cap without deleting redemption rows", () => {
    assert.match(migrationSql, /RAELYNNVIP/);
    assert.match(migrationSql, /max_uses = least\(coalesce\(max_uses, 10\), 10\)/);
    assert.match(migrationSql, /2026-12-31 23:59:59\+00/);
    assert.doesNotMatch(migrationSql, /delete from/i);
    assert.doesNotMatch(migrationSql, /uses_count\s*=\s*0/);
    assert.match(migrationSql, /where not exists/);
  });
});

describe("RAELYNNVIP 7-day access", () => {
  const start = new Date("2026-10-20T18:00:00.000Z");

  it("grants exactly 7 days on a new redemption and leaves other codes open-ended", () => {
    assert.equal(RAELYNN_VIP_ACCESS_DAYS, 7);
    const grant = promoGrant("raelynnvip", start);
    assert.equal(grant.accessDays, 7);
    assert.equal(grant.currentPeriodEnd, new Date(start.getTime() + 7 * DAY_MS).toISOString());
    assert.equal(grant.currentPeriodEnd, "2026-10-27T18:00:00.000Z");

    const other = promoGrant("PRESS2026", start);
    assert.equal(other.accessDays, null);
    assert.equal(other.currentPeriodEnd, null);
  });

  it("tells the fan the window ends, and keeps the open-ended message for other codes", () => {
    const grant = promoGrant(RAELYNN_VIP_CODE, start);
    assert.equal(
      redeemSuccessMessage({ description: "RaeLynn VIP", grant }),
      "Code applied! You have 7 days of complimentary RaeLynn VIP, until 2026-10-27 18:00 UTC.",
    );
    assert.match(
      redeemSuccessMessage({ description: null, grant: promoGrant("OTHER", start) }),
      /You now have complimentary premium access/,
    );
  });

  it("writes the window only after the already-redeemed return, and does not rewrite old rows", () => {
    const already = redeemTs.indexOf("You've already redeemed this code.");
    const grant = redeemTs.indexOf("promoGrant(");
    assert.ok(already !== -1 && grant !== -1 && already < grant);
    assert.match(redeemTs, /current_period_end: grant.currentPeriodEnd/);
    assert.match(redeemTs, /redeemSuccessMessage/);
    assert.doesNotMatch(redeemTs, /from\("promo_code_redemptions"\)\s*\.update\(/);
    assert.doesNotMatch(redeemTs, /from\("fan_community_memberships"\)\s*\.update\(/);
  });

  it("migration records 7 days and expires dated comps without touching existing memberships", () => {
    assert.match(accessSql, /access_days = least\(coalesce\(access_days, 7\), 7\)/);
    assert.match(accessSql, /where upper\(code\) = 'RAELYNNVIP'/);
    assert.match(accessSql, /current_period_end is null/);
    assert.match(accessSql, /current_period_end > now\(\)/);
    assert.match(accessSql, /subscription_tier in \('premium', 'past_due'\)/);
    assert.doesNotMatch(accessSql, /update\s+public\.fan_community_memberships/i);
    assert.doesNotMatch(accessSql, /update\s+public\.promo_code_redemptions/i);
    assert.doesNotMatch(accessSql, /delete\s+from/i);
    assert.doesNotMatch(accessSql, /uses_count\s*=/);
  });

  it("the Premium page explains a dated comp and still treats a null end as open-ended", () => {
    assert.match(premiumPage, /membershipGrantsPremium/);
    assert.match(premiumPage, /complimentary access lasts until/);
    assert.match(premiumPage, /granted directly by the Jonas Group team/);
  });
});
