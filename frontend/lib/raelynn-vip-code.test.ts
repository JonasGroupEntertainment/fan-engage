import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  RAELYNN_VIP_CODE,
  RAELYNN_VIP_EXPIRES_AT,
  RAELYNN_VIP_MAX_USES,
  effectivePromoLimits,
  promoExpired,
  promoLimitReached,
} from "./raelynn-vip-code.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const redeemTs = readRepo("../app/account/promo/actions.ts");
const migrationSql = readRepo("../../supabase/migrations/0076_raelynnvip_comp_cap.sql");

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
