import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

const MIGRATION = "../../supabase/migrations/0100_notifications_community.sql";
const ROLLBACK = "../../supabase/rollbacks/0100_notifications_community_rollback.sql";

/** SQL with comment lines removed, so prose in the header cannot satisfy a check. */
const statements = (sql: string) =>
  sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

describe("0100 lets notifications drop the raelynn default", () => {
  const sql = statements(read(MIGRATION));

  it("allows a notification that belongs to no single community", () => {
    assert.match(sql, /alter table public\.notifications alter column community_id drop not null;/);
  });

  it("drops the default last, after every writer passes a community", () => {
    const dropDefault = sql.indexOf(
      "alter table public.notifications alter column community_id drop default;",
    );
    assert.notEqual(dropDefault, -1);
    for (const earlier of [
      "alter table public.notifications alter column community_id drop not null;",
      "create function public.upsert_notification(",
      "create or replace function public.award_community_badge(",
      "create or replace function public.redeem_reward(",
    ]) {
      const at = sql.indexOf(earlier);
      assert.notEqual(at, -1, earlier);
      assert.ok(at < dropDefault, `${earlier} must come before the default is dropped`);
    }
  });

  it("gives upsert_notification a community argument and writes it", () => {
    assert.match(sql, /p_dedup_key text default null,\s+p_community_id text default null/);
    assert.match(
      sql,
      /insert into notifications \(fan_id, kind, title, body, url, icon, dedup_key, community_id\)\s+values \(p_fan_id, p_kind, p_title, p_body, p_url, p_icon, p_dedup_key, p_community_id\);/,
    );
  });

  it("swaps the old function for the new one in a single statement", () => {
    // Dropping and creating as two hand-run statements would leave a gap in
    // which every badge award fails.
    assert.match(
      sql,
      /do \$swap\$[\s\S]*drop function if exists public\.upsert_notification\(uuid, text, text, text, text, text, text\);[\s\S]*create function public\.upsert_notification\([\s\S]*\$swap\$;/,
    );
  });

  it("keeps upsert_notification closed to browser roles, as 0062 left it", () => {
    assert.match(
      sql,
      /revoke all on function public\.upsert_notification\(uuid, text, text, text, text, text, text, text\) from public, anon, authenticated/,
    );
    assert.match(
      sql,
      /grant execute on function public\.upsert_notification\(uuid, text, text, text, text, text, text, text\) to service_role/,
    );
  });

  it("badge notifications carry the badge's community", () => {
    assert.match(
      sql,
      /'badge:' \|\| p_slug \|\| ':' \|\| p_community_id,\s+p_community_id\s+\);/,
    );
  });

  it("redemption notifications carry the reward's community", () => {
    assert.match(sql, /'redemption:' \|\| v_redemption_id, v_reward\.community_id\);/);
  });

  it("is marked as a draft that an agent must not apply", () => {
    assert.match(read(MIGRATION), /DRAFT\. NOT applied\./);
  });
});

describe("0100 rollback", () => {
  const sql = statements(read(ROLLBACK));

  it("puts the default and NOT NULL back and restores the seven-argument function", () => {
    assert.match(sql, /alter table public\.notifications alter column community_id set default 'raelynn';/);
    assert.match(sql, /update public\.notifications set community_id = 'raelynn' where community_id is null;/);
    assert.match(sql, /alter table public\.notifications alter column community_id set not null;/);
    assert.match(sql, /drop function if exists public\.upsert_notification\(uuid, text, text, text, text, text, text, text\);/);
  });
});

describe("app notification writers set a community", () => {
  it("createNotification requires the caller to say which community, or null", () => {
    const src = read("./data/notifications.ts");
    assert.match(src, /communityId: string \| null;/);
    assert.match(src, /community_id: params\.communityId,/);
  });

  it("the challenge winner notice uses the challenge's artist", () => {
    const src = read("../app/admin/challenges/actions.ts");
    assert.match(src, /kind: "challenge_winner",[\s\S]*communityId: artistSlug \|\| null,/);
  });

  it("the campaign notice uses the campaign's artist", () => {
    const src = read("../app/admin/campaigns/actions.ts");
    assert.match(src, /kind: "campaign",[\s\S]*communityId: artistSlug,/);
  });

  it("the event match notice uses the event's community", () => {
    const src = read("./event-matching/send.ts");
    assert.match(src, /\.select\("id, artist_slug, community_id, title, location, starts_at, url"\)/);
    assert.match(src, /community_id: eventCommunityId,\s+kind: "event_match",/);
  });
});
