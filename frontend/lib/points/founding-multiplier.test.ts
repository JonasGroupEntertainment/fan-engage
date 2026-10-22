import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const migration = readRepo(
  "../../../supabase/migrations/0078_founding_fan_points_multiplier.sql",
);
const backfill = readRepo(
  "../../../scripts/backfill-founding-fan-point-gap.sql",
);
const webhook = readRepo("../../app/api/stripe/webhook/route.ts");
const streak = readRepo("../streaks/touch.ts");
const drop = readRepo("../drops/daily-drop.ts");
const checkin = readRepo("../data/checkins.ts");

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`function public.${name}`);
  assert.ok(start > 0, `missing ${name}`);
  const next = sql.indexOf("\n-- Statement", start + 1);
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

describe("0078 applies 1.5× in one writer", () => {
  const writer = functionBody(migration, "apply_points_award");
  const challenge = functionBody(migration, "award_challenge_entry_points");
  const rsvp = functionBody(migration, "award_event_rsvp_points");
  const badge = functionBody(migration, "award_community_badge");

  it("records the factor and rounds once inside apply_points_award", () => {
    assert.match(migration, /add column if not exists multiplier numeric/);
    assert.match(writer, /v_mult := public\.points_multiplier\(p_fan_id, p_community_id\)/);
    assert.match(writer, /v_source <> 'reward_redemption'/);
    assert.equal(writer.match(/round\(/g)?.length, 1);
    assert.match(writer, /round\(p_base_delta \* v_mult\)::integer/);
    assert.match(writer, /multiplier/);
    assert.match(writer, /when v_founding then ' \(Founding Fan 1\.5x\)'/);
    assert.match(writer, /else ' \(Premium 1\.5x\)'/);
    assert.doesNotMatch(migration, /update public\.points_ledger/);
    assert.match(migration, /NOT applied to production/);
  });

  it("does not multiply spends, and does not multiply a second time in the triggers", () => {
    assert.match(writer, /if p_base_delta < 0 then/);
    assert.match(writer, /v_mult := 1/);
    for (const body of [challenge, rsvp, badge]) {
      assert.match(body, /apply_points_award\(/);
      assert.doesNotMatch(body, /points_multiplier|round\(|bump_membership_points|total_points/);
    }
    assert.match(challenge, /new\.fan_id, 3, 'challenge'/);
    assert.match(rsvp, /new\.fan_id, 10, 'event_rsvp'/);
    assert.match(badge, /p_fan_id,\s*v_points,/);
  });

  it("keeps the writer closed to browser roles", () => {
    assert.match(
      migration,
      /revoke execute on function public\.apply_points_award\(uuid, integer, text, text, text, text\)\s+from public, anon, authenticated/,
    );
    assert.match(
      migration,
      /grant execute on function public\.apply_points_award\(uuid, integer, text, text, text, text\)\s+to service_role/,
    );
  });
});

describe("server awards pass the base and show the credited amount", () => {
  it("referral conversion goes through awardPoints and does not bump totals", () => {
    assert.match(webhook, /awardPoints\(admin,/);
    assert.match(webhook, /delta: REFERRAL_POINTS/);
    assert.match(webhook, /source: "referral"/);
    assert.match(webhook, /communityId: resolvedCommunity/);
    assert.doesNotMatch(webhook, /from\("points_ledger"\)\.insert/);
    assert.doesNotMatch(webhook, /total_points/);
    assert.doesNotMatch(webhook, /referralLedgerOutcome/);
  });

  it("streak, drop, and check-in surface the writer return value", () => {
    assert.match(streak, /dailyAwarded = await awardPoints/);
    assert.match(streak, /pointsAwardedThisVisit: dailyAwarded \+ milestoneAwarded/);
    assert.match(streak, /points_awarded: dailyAwarded/);
    assert.doesNotMatch(streak, /pointsAwardedThisVisit: totalAwarded/);
    assert.match(drop, /select\("id, delta"\)/);
    assert.match(drop, /points: awarded/);
    assert.match(drop, /awarded === 0/);
    assert.match(checkin, /delta: CHECKIN_POINTS/);
    assert.match(checkin, /pointsAwarded: awarded/);
    assert.doesNotMatch(checkin, /pointsAwarded: CHECKIN_POINTS/);
  });
});

describe("past points are not backfilled by the migration", () => {
  it("keeps the gap script out of migrations and commented out", () => {
    assert.match(backfill, /OPT-IN/);
    assert.match(backfill, /Not a migration/);
    assert.match(backfill, /Not run by the/);
    assert.match(backfill, /founding-mult-backfill:/);
    assert.doesNotMatch(migration, /founding-mult-backfill/);
    const apply = backfill.slice(backfill.indexOf("APPLY"));
    assert.match(apply, /-- do \$\$/);
    assert.doesNotMatch(apply, /^do \$\$/m);
  });
});
