import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const src = readFileSync(fileURLToPath(new URL("./data/rewards.ts", import.meta.url)), "utf8");

describe("one waiting redemption per reward (BEP #197 port)", () => {
  it("checks for a pending redemption of the same reward before spending", () => {
    const check = src.indexOf('.eq("status", "pending")');
    const rpc = src.indexOf('supabase.rpc("redeem_reward"');
    assert.ok(check > 0 && rpc > check, "pending check must run before redeem_reward");
    assert.match(src, /\.eq\("fan_id", user\.id\)\s*\.eq\("reward_id", rewardId\)\s*\.eq\("status", "pending"\)/);
  });
  it("tells the fan no more points were spent", () => {
    assert.match(src, /No more points were spent/);
  });
});
