import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { REACTION_SET } from "../community/reactions.ts";
import { POST_BODY_MAX } from "../community/post-input.ts";
import { ONE_PENDING_INDEX } from "../reward-redeem-error.ts";

/**
 * Source checks for migrations 0110 to 0113. The behaviour itself is
 * exercised on a local Postgres by supabase/tests/local/ (40 checks).
 */

const EM_DASH = String.fromCharCode(8212);
const MIGRATIONS = [
  "0110_community_write_guard.sql",
  "0111_storage_upload_limits.sql",
  "0112_one_waiting_redemption_per_reward.sql",
  "0113_fan_text_limits.sql",
];

function readRepo(relFromRepo: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../${relFromRepo}`, import.meta.url)), "utf8");
}

function sqlOf(name: string): string {
  return readRepo(`supabase/migrations/${name}`)
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.notEqual(start, -1, `${name} is defined`);
  const ends = ["end $$;", "end $function$;"].map((e) => sql.indexOf(e, start)).filter((i) => i !== -1);
  return sql.slice(start, Math.min(...ends));
}

describe("0110: what a signed-in session may write to the community", () => {
  const sql = sqlOf("0110_community_write_guard.sql");
  const posts = functionBody(sql, "community_posts_fan_insert_guard");

  it("fans no longer update posts", () => {
    assert.match(sql, /drop policy if exists community_posts_update on public\.community_posts;/);
    assert.doesNotMatch(sql, /create policy community_posts_update/);
  });

  it("the service role and direct SQL pass through the post guard", () => {
    assert.match(posts, /if coalesce\(auth\.role\(\), ''\) not in \('authenticated', 'anon'\) then\s+return new;/);
  });

  it("a session can only create a plain, unpinned post", () => {
    assert.match(posts, /new\.kind is distinct from 'post'::community_post_kind/);
    assert.match(posts, /if coalesce\(new\.pinned, false\) then/);
  });

  it("only the artist's team may limit who sees a post or schedule it", () => {
    // Arrange
    const fanOnly = posts.slice(posts.indexOf("if not v_team then"));

    // Assert
    assert.match(posts, /v_team := public\.is_admin_of\(new\.artist_slug\);/);
    assert.match(fanOnly, /coalesce\(new\.visibility, 'public'\) <> 'public'/);
    assert.match(fanOnly, /new\.scheduled_for is not null/);
  });

  it("a fan needs Premium in that community to post, the same test the app uses", () => {
    assert.match(posts, /if not public\.is_premium\(auth\.uid\(\), new\.artist_slug\) then/);
  });

  it("the post limit matches the composer", () => {
    assert.equal(POST_BODY_MAX, 2000);
    assert.match(posts, /char_length\(new\.body\) > 2000/);
  });

  it("the community and the moderation columns are set by the database", () => {
    assert.match(posts, /new\.community_id := new\.artist_slug;/);
    for (const column of ["moderation_status", "duplicate_of", "announced_at", "resolved_at", "tagged_at"]) {
      assert.ok(posts.includes(`'${column}'`), column);
    }
  });

  it("the guards run before the other insert triggers", () => {
    assert.match(sql, /create trigger aa_community_posts_fan_insert_guard\s+before insert on public\.community_posts/);
    assert.match(sql, /create trigger aa_community_comments_fan_insert_guard\s+before insert on public\.community_comments/);
  });

  it("a comment is 1 to 1,000 characters and starts unmoderated", () => {
    // Arrange
    const comments = functionBody(sql, "community_comments_fan_insert_guard");

    // Assert
    assert.match(comments, /char_length\(new\.body\) > 1000/);
    assert.match(comments, /new\.moderation_status\s+:= 'pending';/);
  });

  it("comments and reactions need a post the fan can see", () => {
    assert.match(sql, /create policy community_comments_insert[\s\S]*?auth\.uid\(\) = author_id and public\.community_post_visible_to_viewer\(post_id\)/);
    assert.match(sql, /create policy community_reactions_insert[\s\S]*?auth\.uid\(\) = fan_id and public\.community_post_visible_to_viewer\(post_id\)/);
  });

  it("the database accepts exactly the reactions the buttons offer", () => {
    // Arrange: the migration writes each reaction as escaped code points.
    const escaped = REACTION_SET.map((emoji) =>
      "E'" +
      [...emoji]
        .map((ch) => {
          const cp = ch.codePointAt(0) ?? 0;
          return cp > 0xffff
            ? `\\U${cp.toString(16).toUpperCase().padStart(8, "0")}`
            : `\\u${cp.toString(16).toUpperCase().padStart(4, "0")}`;
        })
        .join("") +
      "'",
    );

    // Assert
    assert.ok(sql.includes(`check (emoji in (${escaped.join(", ")}))`));
  });

  it("the time on a post or comment is the server's", () => {
    assert.match(posts, /new\.created_at := case when v_team then coalesce\(new\.scheduled_for, now\(\)\) else now\(\) end;/);
    assert.match(functionBody(sql, "community_comments_fan_insert_guard"), /new\.created_at\s+:= now\(\);/);
  });

  it("a vote must be on a visible poll, for one of its own options", () => {
    // Arrange
    const votes = functionBody(sql, "community_poll_votes_guard");

    // Assert
    assert.match(sql, /create policy community_poll_votes_insert[\s\S]*?auth\.uid\(\) = fan_id and public\.community_post_visible_to_viewer\(post_id\)/);
    assert.match(votes, /p\.kind = 'poll'::community_post_kind/);
    assert.match(votes, /o\.id = new\.option_id and o\.post_id = new\.post_id/);
  });

  it("an entry must be on a visible challenge", () => {
    assert.match(sql, /create policy community_challenge_entries_insert[\s\S]*?public\.community_post_visible_to_viewer\(post_id\)/);
    assert.match(functionBody(sql, "community_challenge_entries_guard"), /p\.kind = 'challenge'::community_post_kind/);
  });

  it("two posts saved together are counted one after the other", () => {
    // Arrange
    const award = functionBody(sql, "award_community_post_points");

    // Assert
    assert.ok(award.indexOf("from fans where id = new.author_id for update") < award.indexOf("select count(*) into v_today"));
  });

  it("does not wait long behind another write", () => {
    assert.match(sql, /set local lock_timeout = '5s';/);
  });

  it("post points stop at five paid posts a day", () => {
    // Arrange
    const award = functionBody(sql, "award_community_post_points");

    // Assert
    assert.match(award, /created_at >= public\.activity_day_start\(\);\s+if v_today >= 5 then\s+return new;/);
    assert.match(award, /apply_points_award\(new\.author_id, 5, 'challenge', v_ref, new\.artist_slug, 'Community post'\)/);
  });

  it("a take-back never takes more than the fan has, and is written once", () => {
    // Arrange
    const takeBack = functionBody(sql, "take_back_community_points");

    // Assert
    assert.match(takeBack, /v_take := least\(v_earned, greatest\(v_balance, 0\)\);/);
    assert.match(takeBack, /if exists \(select 1 from points_ledger where source_ref = p_removed_ref\) then\s+return;/);
    assert.match(takeBack, /if not found then\s+return;/);
  });

  it("a comment's points come back only when its own author deletes it", () => {
    assert.match(
      functionBody(sql, "community_comments_take_back_points"),
      /if auth\.uid\(\) is distinct from old\.author_id then\s+return old;/,
    );
  });

  it("the new helper functions are closed to sessions", () => {
    for (const fn of [
      "community_posts_fan_insert_guard()",
      "community_comments_fan_insert_guard()",
      "take_back_community_points(uuid, text, text, text)",
    ]) {
      assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated;`), fn);
    }
  });

  it("has a rollback file", () => {
    assert.match(readRepo("supabase/rollbacks/0110_community_write_guard_rollback.sql"), /Review-only\. Do not apply unless Kevin says so\./);
  });
});

describe("0111: upload buckets", () => {
  const sql = sqlOf("0111_storage_upload_limits.sql");

  it("pictures are limited to 8 MB and the four image types the uploader accepts", () => {
    assert.match(sql, /file_size_limit = 8388608,\s+allowed_mime_types = array\['image\/jpeg', 'image\/png', 'image\/webp', 'image\/gif'\]\s+where id in \('avatars', 'community-uploads'\);/);
  });

  it("videos are limited to three video types", () => {
    assert.match(sql, /allowed_mime_types = array\['video\/mp4', 'video\/webm', 'video\/quicktime'\]\s+where id = 'community-videos';/);
  });
});

describe("0112: one waiting redemption per reward", () => {
  it("is a unique index on pending rows, named as the app expects", () => {
    // Arrange
    const sql = sqlOf("0112_one_waiting_redemption_per_reward.sql");

    // Assert
    assert.ok(sql.includes(`create unique index if not exists ${ONE_PENDING_INDEX}`));
    assert.match(sql, /on public\.reward_redemptions \(fan_id, reward_id\)\s+where status = 'pending';/);
  });

  it("the app turns that refusal into the friendly line", () => {
    assert.match(readRepo("frontend/lib/data/rewards.ts"), /return \{ ok: false, error: redeemErrorMessage\(error\) \};/);
  });
});

describe("0113: text limits", () => {
  const sql = sqlOf("0113_fan_text_limits.sql");

  it("limits the fields a fan can type about themselves", () => {
    for (const rule of [
      "char_length(first_name) <= 50",
      "char_length(city) <= 80",
      "char_length(socials::text) <= 2000",
      "char_length(delivery_details) <= 500",
      "char_length(body) <= 1000",
    ]) {
      assert.ok(sql.includes(rule), rule);
    }
  });

  it("only allows a missing value or one within the limit", () => {
    assert.match(sql, /check \(%I is null or %s\)/);
  });
});

describe("the migration files follow the house rules", () => {
  it("have no em dashes and are not marked applied before they are", () => {
    for (const name of MIGRATIONS) {
      const raw = readRepo(`supabase/migrations/${name}`);
      assert.equal(raw.includes(EM_DASH), false, name);
    }
  });
});
