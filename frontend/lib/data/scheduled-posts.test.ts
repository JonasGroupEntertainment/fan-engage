import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  isDueForAnnouncement,
  isMissingScheduledColumnError,
  isPendingScheduledPost,
  isScheduledPostVisible,
  partitionScheduledPosts,
  scheduledPostsVisibleFilter,
  withScheduledFilterFallback,
} from "./scheduled-posts.ts";

function readRepo(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

/** Strip `-- …` comment lines so assertions only see executable SQL. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("0094_scheduled_posts — migration shape", () => {
  const raw = readRepo("../../../supabase/migrations/0094_scheduled_posts.sql");
  const sql = stripComments(raw);
  const prior = stripComments(readRepo("../../../supabase/migrations/0091_presave_and_ai_gates.sql"));

  it("adds both columns idempotently", () => {
    assert.match(sql, /alter table public\.community_posts\s+add column if not exists scheduled_for timestamptz/);
    assert.match(sql, /alter table public\.community_posts\s+add column if not exists announced_at timestamptz/);
  });

  it("indexes scheduled_for partially (only scheduled rows)", () => {
    assert.match(
      sql,
      /create index if not exists community_posts_scheduled_for_idx\s+on public\.community_posts \(scheduled_for\)\s+where scheduled_for is not null/,
    );
  });

  it("recreates community_posts_public_read with 0091's exact body plus the scheduled gate", () => {
    assert.match(sql, /drop policy if exists community_posts_public_read on public\.community_posts/);
    const policy = (name: string, src: string) => {
      const m = src.match(new RegExp(`create policy ${name} on public\\.community_posts\\s+for select using \\(([\\s\\S]*?)\\);`));
      assert.ok(m, `${name} policy not found`);
      return m[1].replace(/\s+/g, " ").trim();
    };
    const before = policy("community_posts_public_read", prior);
    const after = policy("community_posts_public_read", sql);
    assert.equal(after, `${before} and (scheduled_for is null or scheduled_for <= now())`);
  });

  it("leaves author_read / admin_read alone and drops no table", () => {
    assert.doesNotMatch(sql, /community_posts_author_read/);
    assert.doesNotMatch(sql, /community_posts_admin_read/);
    assert.doesNotMatch(sql, /drop table/i);
    assert.doesNotMatch(sql, /drop column/i);
  });
});

describe("scheduled-posts helpers", () => {
  const now = new Date("2026-10-29T12:00:00.000Z");
  const past = "2026-10-29T11:00:00.000Z";
  const future = "2026-10-29T13:00:00.000Z";

  it("filter expression matches the RLS clause", () => {
    assert.equal(
      scheduledPostsVisibleFilter(now),
      "scheduled_for.is.null,scheduled_for.lte.2026-10-29T12:00:00.000Z",
    );
  });

  it("visibility: null and past are visible, future is not", () => {
    assert.equal(isScheduledPostVisible({ scheduled_for: null }, now), true);
    assert.equal(isScheduledPostVisible({ scheduled_for: past }, now), true);
    assert.equal(isScheduledPostVisible({ scheduled_for: future }, now), false);
    assert.equal(isPendingScheduledPost({ scheduled_for: future }, now), true);
    assert.equal(isPendingScheduledPost({ scheduled_for: null }, now), false);
  });

  it("cron picks due, unannounced, scheduled rows only", () => {
    assert.equal(isDueForAnnouncement({ scheduled_for: past, announced_at: null }, now), true);
    assert.equal(isDueForAnnouncement({ scheduled_for: past, announced_at: past }, now), false);
    assert.equal(isDueForAnnouncement({ scheduled_for: future, announced_at: null }, now), false);
    assert.equal(isDueForAnnouncement({ scheduled_for: null, announced_at: null }, now), false);
  });

  it("partition splits live from scheduled, soonest scheduled first", () => {
    const later = "2026-10-30T13:00:00.000Z";
    const { live, scheduled } = partitionScheduledPosts(
      [
        { id: "a", scheduled_for: later },
        { id: "b", scheduled_for: null },
        { id: "c", scheduled_for: future },
        { id: "d", scheduled_for: past },
      ],
      now,
    );
    assert.deepEqual(live.map((p) => p.id), ["b", "d"]);
    assert.deepEqual(scheduled.map((p) => p.id), ["c", "a"]);
  });
});

describe("pre-0094 fallback", () => {
  const missing = { message: 'column community_posts.scheduled_for does not exist', code: "42703" };

  it("recognises PostgREST's missing-column error and nothing else", () => {
    assert.equal(isMissingScheduledColumnError(missing), true);
    assert.equal(isMissingScheduledColumnError({ message: "Could not find the 'scheduled_for' column of 'community_posts' in the schema cache" }), true);
    assert.equal(isMissingScheduledColumnError({ message: "permission denied for table community_posts" }), false);
    assert.equal(isMissingScheduledColumnError(null), false);
  });

  it("retries without the filter only on that error", async () => {
    const calls: boolean[] = [];
    const res = await withScheduledFilterFallback(async (withFilter) => {
      calls.push(withFilter);
      return withFilter ? { data: null, error: missing } : { data: [{ id: "x" }], error: null };
    });
    assert.deepEqual(calls, [true, false]);
    assert.deepEqual(res.data, [{ id: "x" }]);

    const other = { message: "boom" };
    const calls2: boolean[] = [];
    const res2 = await withScheduledFilterFallback(async (withFilter) => {
      calls2.push(withFilter);
      return { data: null, error: other };
    });
    assert.deepEqual(calls2, [true]);
    assert.equal(res2.error, other);
  });

  it("every fan-facing service-role reader filters AND retries without the column", () => {
    const readers = [
      "./fan-home.ts",
      "./fan-profile.ts",
      "./community.ts",
      "../search/query.ts",
      "../personal-feed/compute.ts",
      "../../app/artists/[slug]/community/founder-gate.ts",
    ];
    for (const rel of readers) {
      const src = readRepo(rel);
      assert.match(src, /scheduledPostsVisibleFilter\(\)/, rel);
      assert.match(src, /withScheduledFilterFallback|isMissingScheduledColumnError/, rel);
    }
  });
});

describe("announcing a scheduled post claims the row before pushing", () => {
  it("cron: announced_at is stamped (where still null, row required) before notifyNewPost", () => {
    const src = readRepo("../../app/api/cron/publish-scheduled-posts/route.ts");
    const claim = src.search(/\.update\(\{ announced_at: [^}]*\}\)[\s\S]*?\.is\("announced_at", null\)[\s\S]*?\.select\("id"\)/);
    const notify = src.search(/await notifyNewPost\(/);
    assert.ok(claim >= 0, "claim update not found");
    assert.ok(notify >= 0, "notify not found");
    assert.ok(claim < notify, "notifyNewPost must come after the announced_at claim");
    assert.match(src, /if \(!claimed\) continue/);
    assert.equal((src.match(/await notifyNewPost\(/g) ?? []).length, 1);
  });

  it("portal Publish now: same claim-first shape, and works for an already-due post", () => {
    const src = readRepo("../../app/artist-portal/community/actions.ts");
    const fn = src.slice(src.indexOf("export async function publishScheduledPostNowAction"), src.indexOf("export async function unschedulePostAction"));
    const claim = fn.search(/\.is\("announced_at", null\)[\s\S]*?\.select\("id"\)/);
    const notify = fn.search(/await notifyNewPost\(/);
    assert.ok(claim >= 0 && notify >= 0 && claim < notify);
    assert.match(fn, /if \(claimed\)/);
    assert.doesNotMatch(fn, /\.gt\("scheduled_for"/, "a due-but-unannounced post must still be publishable");
    assert.match(fn, /stillFuture/);
  });

  it("portal Unschedule restores the originating AI draft (looked up before the FK nulls it)", () => {
    const src = readRepo("../../app/artist-portal/community/actions.ts");
    const fn = src.slice(src.indexOf("export async function unschedulePostAction"), src.indexOf("export async function discardPortalDraftAction"));
    const lookup = fn.search(/\.eq\("published_post_id", postId\)/);
    const del = fn.search(/\.delete\(\)/);
    assert.ok(lookup >= 0 && del >= 0 && lookup < del, "draft lookup must precede the delete");
    assert.match(fn, /status: "pending"/);
  });
});
