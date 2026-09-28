import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const migration = read("../../../supabase/migrations/0063_cancel_redemption.sql");
const helper = read("./cancel.ts");
const adminRedemptions = read("../../app/admin/redemptions/actions.ts");
const adminRewards = read("../../app/admin/rewards/actions.ts");
const portal = read("../../app/artist-portal/redemptions/actions.ts");

const cancelBody = (src: string, name: string) => {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  return src.slice(start, src.indexOf("\n}\n", start));
};

describe("0063 cancel_redemption", () => {
  it("locks the redemption row and requires pending", () => {
    assert.match(migration, /from public\.reward_redemptions\s+where id = p_redemption_id\s+for update/);
    assert.match(migration, /if v_redemption\.status <> 'pending' then/);
  });

  it("checks the caller's community when one is given", () => {
    assert.match(
      migration,
      /p_community_id is not null\s+and v_redemption\.community_id is distinct from p_community_id/,
    );
  });

  it("refunds the stored cost with a direct ledger insert, no multiplier", () => {
    assert.match(migration, /v_redemption\.point_cost,\s+'reward_redemption',\s+'redemption:' \|\| p_redemption_id \|\| ':refund'/);
    const body = migration.slice(migration.indexOf("create or replace function public.cancel_redemption"));
    assert.doesNotMatch(body, /apply_points_award|points_multiplier/);
  });

  it("allows only one refund row per redemption", () => {
    assert.match(
      migration,
      /create unique index if not exists points_ledger_redemption_refund_unique\s+on public\.points_ledger \(source_ref\)\s+where source_ref like 'redemption:%:refund'/,
    );
  });

  it("is callable by the service role only", () => {
    assert.match(migration, /revoke all on function public\.cancel_redemption\(uuid, text\) from public, anon, authenticated/);
    assert.match(migration, /grant execute on function public\.cancel_redemption\(uuid, text\) to service_role/);
  });
});

describe("cancel actions", () => {
  it("helper calls the RPC and never takes a point cost", () => {
    assert.match(helper, /admin\.rpc\("cancel_redemption"/);
    assert.doesNotMatch(helper, /pointCost|point_cost/);
  });

  for (const [label, src, name] of [
    ["admin redemptions", adminRedemptions, "cancelRedemptionAction"],
    ["admin rewards", adminRewards, "cancelRedemptionAction"],
    ["artist portal", portal, "cancelRedemptionPortalAction"],
  ] as const) {
    it(`${label} goes through cancelRedemption only`, () => {
      const body = cancelBody(src, name);
      assert.match(body, /cancelRedemption\(/);
      assert.doesNotMatch(body, /pointCost|point_cost|total_points|points_ledger|awardPoints/);
    });
  }

  it("admin paths scope non-super admins to their community", () => {
    for (const src of [adminRedemptions, adminRewards]) {
      assert.match(src, /ctx\.isSuperAdmin \? null : ctx\.currentCommunityId/);
    }
  });
});
