import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const MIGRATION = "../../supabase/migrations/0101_redeem_reward_without_community.sql";
const ROLLBACK = "../../supabase/rollbacks/0101_redeem_reward_without_community_rollback.sql";

/** SQL with comment lines removed, so prose in the header cannot satisfy a check. */
const statements = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

describe("0101 lets a reward with no community be redeemed", () => {
  const sql = statements(read(MIGRATION));

  it("adds a community argument to redeem_reward", () => {
    assert.match(
      sql,
      /create function public\.redeem_reward\(\s*p_fan_id uuid,\s*p_reward_id uuid,\s*p_delivery_details text default null,\s*p_community_id text default null\s*\)/,
    );
  });

  it("the reward's own community always wins over the one the caller sends", () => {
    assert.match(sql, /v_community := coalesce\(v_reward\.community_id, nullif\(btrim\(p_community_id\), ''\)\);/);
  });

  it("refuses with a clear message when there is no community at all", () => {
    assert.match(
      sql,
      /if v_community is null then\s+raise exception 'Choose a community to redeem this reward';/,
    );
  });

  it("only lets a fan charge a community they belong to", () => {
    assert.match(
      sql,
      /if v_reward\.community_id is null then[\s\S]*?where fan_id = p_fan_id and community_id = v_community;[\s\S]*?raise exception 'Not a member of this community';/,
    );
  });

  it("writes the same community to the redemption, the ledger and the notice", () => {
    assert.match(
      sql,
      /values \(p_fan_id, p_reward_id, v_community, v_reward\.point_cost, p_delivery_details, 'pending'\)/,
    );
    assert.match(
      sql,
      /'reward_redemption', 'redemption:' \|\| v_redemption_id, v_community, 'Redeemed: ' \|\| v_reward\.title\);/,
    );
    assert.match(
      sql,
      /'\/artists\/' \|\| v_community \|\| '\/rewards', null, 'redemption:' \|\| v_redemption_id, v_community\);/,
    );
    // No write may still use the reward's possibly-missing community.
    assert.doesNotMatch(sql, /values \(p_fan_id, p_reward_id, v_reward\.community_id,/);
  });

  it("swaps the function in one statement and keeps who may call it", () => {
    assert.match(
      sql,
      /do \$swap\$[\s\S]*drop function if exists public\.redeem_reward\(uuid, uuid, text\);[\s\S]*create function public\.redeem_reward\([\s\S]*\$swap\$;/,
    );
    assert.match(
      sql,
      /revoke all on function public\.redeem_reward\(uuid, uuid, text, text\) from public, anon;/,
    );
    assert.match(
      sql,
      /grant execute on function public\.redeem_reward\(uuid, uuid, text, text\) to authenticated, service_role;/,
    );
  });

  it("does not open the redeemable gate", () => {
    // Which rewards may be redeemed at all is a launch decision, not this fix.
    assert.doesNotMatch(sql, /create (or replace )?function public\.reward_is_digitally_redeemable/);
  });

  it("is marked as a draft that an agent must not apply", () => {
    assert.match(read(MIGRATION), /DRAFT\. NOT applied\./);
  });
});

describe("0101 rollback", () => {
  it("restores the three-argument function with the same grants", () => {
    const sql = statements(read(ROLLBACK));
    assert.match(sql, /drop function if exists public\.redeem_reward\(uuid, uuid, text, text\);/);
    assert.match(sql, /grant execute on function public\.redeem_reward\(uuid, uuid, text\) to authenticated, service_role;/);
  });
});

describe("the app sends the page's community only when the reward has none", () => {
  const src = read("./data/rewards.ts");

  it("redeemReward accepts the community of the page the fan is on", () => {
    assert.match(src, /pageCommunityId\?: string \| null;/);
  });

  it("keeps the three-argument call for rewards that have a community", () => {
    // The live function takes three arguments until 0101 is applied. Sending
    // a fourth for every redemption would break RaeLynn rewards in between.
    assert.match(
      src,
      /\.\.\.\(communityId === null && pageCommunityId \? \{ p_community_id: pageCommunityId \} : \{\}\),/,
    );
  });

  it("the redeem form and action pass the artist page's slug along", () => {
    assert.match(read("../app/artists/[slug]/rewards/redeem-form.tsx"), /formData\.append\("communitySlug", artistSlug\);/);
    assert.match(read("../app/artists/[slug]/rewards/actions.ts"), /pageCommunityId: communitySlug,/);
  });
});
