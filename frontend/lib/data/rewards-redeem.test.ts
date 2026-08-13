import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const rewardsTs = readFileSync(
  fileURLToPath(new URL("./rewards.ts", import.meta.url)),
  "utf8",
);
const actionTs = readFileSync(
  fileURLToPath(new URL("../../app/artists/[slug]/rewards/actions.ts", import.meta.url)),
  "utf8",
);
const webhookTs = readFileSync(
  fileURLToPath(new URL("../../app/api/stripe/webhook/route.ts", import.meta.url)),
  "utf8",
);
const migrationSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/0050_lock_redeem_and_membership_economy.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("A-P0-2 redeem path uses session user only", () => {
  it("redeemReward does not accept a caller-supplied fanId", () => {
    const redeemFn = rewardsTs.slice(rewardsTs.indexOf("export async function redeemReward"));
    assert.match(redeemFn, /getUser\(\)/);
    assert.match(redeemFn, /p_fan_id:\s*user\.id/);
    assert.doesNotMatch(redeemFn, /fanId\??:\s*string/);
    assert.doesNotMatch(actionTs, /fanId:\s*user\.id/);
  });

  it("migration binds authenticated redeem to auth.uid() and revokes anon", () => {
    assert.match(
      migrationSql,
      /auth\.uid\(\) is distinct from p_fan_id/,
    );
    assert.match(
      migrationSql,
      /revoke all on function public\.redeem_reward\(uuid, uuid, text\) from public, anon/,
    );
  });
});

describe("A-P0-1 webhook completion", () => {
  it("route uses the completion helper instead of always stamping processed_at", () => {
    assert.match(webhookTs, /stripeEventCompletionPatch\(processError\)/);
    assert.match(webhookTs, /isStripeEventReplay\(existing\?\.processed_at\)/);
    assert.doesNotMatch(
      webhookTs,
      /processed_at:\s*new Date\(\)\.toISOString\(\)/,
    );
  });
});

describe("A-P0-3 membership economy lock", () => {
  it("migration revokes client UPDATE on billing and points columns", () => {
    assert.match(migrationSql, /revoke update \(/);
    assert.match(migrationSql, /subscription_tier/);
    assert.match(migrationSql, /on public\.fan_community_memberships/);
    assert.match(migrationSql, /reject_client_economy_column_changes/);
  });
});
