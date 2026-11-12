import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Shape of 0091_presave_and_ai_gates.sql (Sprint 3 item C). Pure-logic tests
 * live next to their modules: lib/presave/core.test.ts,
 * lib/founder-gate/core.test.ts, lib/ai-gates/core.test.ts.
 */
const sql = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/0091_presave_and_ai_gates.sql", import.meta.url)),
  "utf8",
);

describe("0091_presave_and_ai_gates — shape", () => {
  it("is idempotent and never drops a table", () => {
    assert.doesNotMatch(sql, /drop table/i);
    assert.match(sql, /add column if not exists release_date date/);
    assert.match(sql, /create table if not exists public\.ai_feature_gates/);
    assert.match(sql, /create or replace function public\.award_fan_action_points\(\)/);
    for (const policy of [
      "fan_actions_anon_read_active",
      "ai_feature_gates_super_admin_select",
      "ai_feature_gates_super_admin_write",
      "community_posts_public_read",
    ]) {
      assert.match(sql, new RegExp(`drop policy if exists ${policy} on`), policy);
      assert.match(sql, new RegExp(`create policy ${policy} on`), policy);
    }
  });

  it("reuses fan_actions for pre-saves rather than adding a presave_campaigns table", () => {
    assert.doesNotMatch(sql, /create table if not exists public\.presave_campaigns/);
    assert.match(sql, /if v_kind = 'pre_save' then\s+new\.points_awarded := 0;\s+return new;/);
  });

  it("keeps the share path and the generic CTA award unchanged", () => {
    assert.match(sql, /perform public\.try_award_share_points\(new\.fan_id, v_slug, v_ref\)/);
    assert.match(sql, /'social_share', v_ref, v_slug, 'CTA completed'/);
  });

  it("ai_feature_gates: pk, FK to communities(slug), RLS on, super-admin via admin_users '*'", () => {
    assert.match(sql, /community_id\s+text not null references public\.communities\(slug\)/);
    assert.match(sql, /primary key \(feature, community_id\)/);
    assert.match(sql, /alter table public\.ai_feature_gates enable row level security/);
    assert.match(sql, /revoke all on table public\.ai_feature_gates from anon/);
  });

  it("community_posts: founder-only restricted at the DB, authors/admins untouched", () => {
    assert.match(sql, /drop policy if exists community_posts_select on public\.community_posts/);
    assert.match(sql, /visibility is distinct from 'founder-only'/);
    assert.match(sql, /auth\.uid\(\) is not null and public\.is_founder\(auth\.uid\(\), artist_slug\)/);
    assert.doesNotMatch(sql, /drop policy if exists community_posts_author_read/);
    assert.doesNotMatch(sql, /drop policy if exists community_posts_admin_read/);
  });
});
