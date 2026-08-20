import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  applyFoundingMultiplier,
  countFoundingFanNumbers,
  FOUNDING_FAN_CAP,
  foundingClaimStateFromCount,
  isDigitallyRedeemableTitle,
  ledgerBalance,
  simulateSerializedSpendRace,
  spendFromLedger,
  shouldShowPublicLeaderboard,
} from "./economy.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const migrationSql = readRepo(
  "../../../supabase/migrations/0053_superfan_loop.sql",
);
const awardTs = readRepo("./award.ts");
const onboardTs = readRepo("../../app/api/fan-engage/onboard/route.ts");

describe("founding claim remaining is cap minus claimed", () => {
  it("never treats remaining as an independent leftover", () => {
    const seven = foundingClaimStateFromCount(7);
    assert.equal(seven.cap, FOUNDING_FAN_CAP);
    assert.equal(seven.claimed, 7);
    assert.equal(seven.remaining, FOUNDING_FAN_CAP - 7);
    assert.equal(seven.closed, false);

    const empty = foundingClaimStateFromCount(0);
    assert.equal(empty.remaining, FOUNDING_FAN_CAP);
    assert.equal(empty.closed, false);

    const full = foundingClaimStateFromCount(FOUNDING_FAN_CAP);
    assert.equal(full.remaining, 0);
    assert.equal(full.closed, true);

    const over = foundingClaimStateFromCount(FOUNDING_FAN_CAP + 4);
    assert.equal(over.remaining, 0);
    assert.equal(over.closed, true);
  });

  it("counts only founding numbers 1–100", () => {
    assert.equal(
      countFoundingFanNumbers([1, 50, 99, 100, null, 0, 101, undefined, -4]),
      4,
    );
    assert.equal(countFoundingFanNumbers([]), 0);
    assert.equal(countFoundingFanNumbers([50]), 1);
  });
});

describe("Founding Fan 1.5× writer contract", () => {
  it("applies 1.5× for founding numbers 1–100 and not for 101", () => {
    assert.equal(applyFoundingMultiplier(10, { foundingFanNumber: 1 }), 15);
    assert.equal(applyFoundingMultiplier(10, { foundingFanNumber: 100 }), 15);
    assert.equal(applyFoundingMultiplier(10, { foundingFanNumber: 101 }), 10);
    assert.equal(applyFoundingMultiplier(10, { foundingFanNumber: null }), 10);
    assert.equal(applyFoundingMultiplier(100, { foundingFanNumber: 3 }), 150);
  });

  it("does not multiply spends and does not stack premium + founding", () => {
    assert.equal(
      applyFoundingMultiplier(-250, { foundingFanNumber: 1, isPremium: true }),
      -250,
    );
    assert.equal(
      applyFoundingMultiplier(10, { foundingFanNumber: 1, isPremium: true }),
      15,
    );
  });

  it("SQL writer calls points_multiplier and apply_points_award", () => {
    assert.match(migrationSql, /founding_fan_number <= 100/);
    assert.match(migrationSql, /then 1\.5/);
    assert.match(migrationSql, /create or replace function public\.apply_points_award/);
    assert.match(awardTs, /apply_points_award/);
    assert.match(onboardTs, /claim_founding_fan_status/);
    assert.match(migrationSql, /create or replace function public\.claim_founding_fan_status/);
    assert.match(migrationSql, /perform public\.try_award_comment_points\(new\.id\)/);
    assert.match(migrationSql, /perform public\.try_award_poll_points\(new\.post_id, new\.fan_id\)/);
    const claimAt = onboardTs.indexOf("claim_founding_fan_status");
    const bonusAt = onboardTs.indexOf("Award signup bonus");
    assert.ok(claimAt > 0 && bonusAt > claimAt, "founding claim must precede welcome award");
  });
});

describe("earn / spend races", () => {
  it("serializes two 250-pt spends against 250 so only one succeeds", () => {
    const race = simulateSerializedSpendRace({ openingBalance: 250, cost: 250 });
    assert.equal(race.first.ok, true);
    assert.equal(race.second.ok, false);
    if (!race.second.ok) assert.equal(race.second.reason, "insufficient");
    assert.equal(race.finalBalance, 0);
  });

  it("two 250-pt spends against 500 both succeed without overdraft", () => {
    const race = simulateSerializedSpendRace({ openingBalance: 500, cost: 250 });
    assert.equal(race.first.ok, true);
    assert.equal(race.second.ok, true);
    assert.equal(race.finalBalance, 0);
  });

  it("rejects a duplicate source_ref so the same redemption cannot post twice", () => {
    const fanId = "fan-a";
    const open = [{ fanId, delta: 1000, sourceRef: "open" }];
    const first = spendFromLedger(open, fanId, 250, "redemption:same");
    assert.equal(first.ok, true);
    const second = spendFromLedger(first.entries, fanId, 250, "redemption:same");
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.reason, "duplicate");
    assert.equal(ledgerBalance(second.entries, fanId), 750);
  });

  it("SQL redeem locks the fan row and spends from fan_ledger_balance", () => {
    assert.match(migrationSql, /from public\.fans where id = p_fan_id for update/);
    assert.match(migrationSql, /v_balance := public\.fan_ledger_balance\(p_fan_id\)/);
    assert.match(migrationSql, /if v_balance < v_reward\.point_cost/);
    assert.match(migrationSql, /auth\.uid\(\) is distinct from p_fan_id/);
  });
});

describe("digital redemption allowlist", () => {
  it("lets the three live digital SKUs redeem and holds the raffle", () => {
    assert.equal(isDigitallyRedeemableTitle("Phone Wallpaper"), true);
    assert.equal(isDigitallyRedeemableTitle("Lyric Wallpaper"), true);
    assert.equal(isDigitallyRedeemableTitle("Fan Spotlight"), true);
    assert.equal(isDigitallyRedeemableTitle("VIP Moment Raffle"), false);
    assert.equal(
      isDigitallyRedeemableTitle("Behind-the-Song Video", { clipUrl: null }),
      false,
    );
    assert.equal(isDigitallyRedeemableTitle("Signed Physical Merch"), false);
    assert.match(migrationSql, /VIP Moment Raffle is on hold until a show date exists/);
    assert.match(migrationSql, /reward_is_digitally_redeemable/);
  });
});

describe("leaderboard honesty", () => {
  it("hides one person at 4 pts and a two-fan board", () => {
    assert.equal(shouldShowPublicLeaderboard({ totalFans: 1, topScore: 4 }), false);
    assert.equal(shouldShowPublicLeaderboard({ totalFans: 2, topScore: 80 }), false);
    assert.equal(shouldShowPublicLeaderboard({ totalFans: 3, topScore: 24 }), false);
    assert.equal(shouldShowPublicLeaderboard({ totalFans: 3, topScore: 25 }), true);
  });
});
