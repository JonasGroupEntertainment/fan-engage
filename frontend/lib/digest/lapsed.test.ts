import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  LAPSED_MAX_DAYS,
  LAPSED_MIN_DAYS,
  LAPSED_NUDGE_KIND,
  LAPSED_RESEND_DAYS,
  activityBucket,
  countBuckets,
  daysSince,
  fanLastActivity,
  groupMemberships,
  lapsedActivityCutoffIso,
  lapsedDedupKey,
  lapsedResendCutoffIso,
  latestActivityByFan,
  primaryArtistSlug,
  recentlyNudgedIds,
  selectLapsedFans,
  type LapsedFanRow,
} from "./lapsed.ts";
import { DEFAULT_COMMUNITY_SLUG } from "../community-default.ts";

const NOW = new Date("2026-10-29T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();
const dateDaysAgo = (n: number) => daysAgo(n).slice(0, 10);

function fan(id: string, patch: Partial<LapsedFanRow> = {}): LapsedFanRow {
  return { id, email: `${id}@example.com`, first_name: id, ...patch };
}

describe("activityBucket", () => {
  it("is inclusive at both edges of the 14–30 day window", () => {
    assert.equal(activityBucket(NOW.getTime() - 13 * DAY, NOW), "active");
    assert.equal(activityBucket(NOW.getTime() - LAPSED_MIN_DAYS * DAY, NOW), "lapsed");
    assert.equal(activityBucket(NOW.getTime() - LAPSED_MAX_DAYS * DAY, NOW), "lapsed");
    // 30 days + 1 ms is still 30 whole days; dormant starts at 31.
    assert.equal(activityBucket(NOW.getTime() - (LAPSED_MAX_DAYS * DAY + 1), NOW), "lapsed");
    assert.equal(activityBucket(NOW.getTime() - (LAPSED_MAX_DAYS + 1) * DAY, NOW), "dormant");
  });

  it("treats a fan with no signal as unknown, never lapsed", () => {
    assert.equal(activityBucket(null, NOW), "unknown");
    assert.equal(activityBucket(undefined, NOW), "unknown");
  });

  it("floors partial days and clamps the future to 0", () => {
    assert.equal(daysSince(NOW.getTime() - 13.9 * DAY, NOW), 13);
    assert.equal(daysSince(NOW.getTime() + DAY, NOW), 0);
  });
});

describe("latestActivityByFan", () => {
  it("keeps the newest timestamp per fan and skips junk rows", () => {
    const latest = latestActivityByFan([
      { fan_id: "a", at: daysAgo(20) },
      { fan_id: "a", at: daysAgo(5) },
      { fan_id: "a", at: daysAgo(40) },
      { fan_id: "b", at: "not a date" },
      { fan_id: "", at: daysAgo(1) },
      { fan_id: "c", at: null },
    ]);
    assert.equal(latest.get("a"), NOW.getTime() - 5 * DAY);
    assert.equal(latest.has("b"), false);
    assert.equal(latest.has("c"), false);
    assert.equal(latest.size, 1);
  });
});

describe("fanLastActivity", () => {
  it("folds last_active_date (a UTC day) and created_at into the signals", () => {
    const signals = latestActivityByFan([{ fan_id: "a", at: daysAgo(25) }]);
    const viaDate = fanLastActivity(fan("a", { last_active_date: dateDaysAgo(2) }), signals);
    assert.equal(viaDate, Date.parse(`${dateDaysAgo(2)}T00:00:00Z`));
    const viaSignup = fanLastActivity(fan("a", { created_at: daysAgo(1) }), signals);
    assert.equal(viaSignup, NOW.getTime() - DAY);
    const older = fanLastActivity(fan("a", { last_active_date: dateDaysAgo(40) }), signals);
    assert.equal(older, NOW.getTime() - 25 * DAY);
  });
});

describe("selectLapsedFans", () => {
  const slugs = new Map<string, string[]>([
    ["lapsed", ["artist-one", "artist-two"]],
    ["edge14", ["artist-one"]],
    ["edge30", ["artist-one"]],
  ]);

  function run(fans: LapsedFanRow[], opts: Partial<Parameters<typeof selectLapsedFans>[0]> = {}) {
    return selectLapsedFans({
      fans,
      lastActivity: new Map(),
      artistSlugsByFan: slugs,
      recentlyNudged: new Set(),
      now: NOW,
      ...opts,
    });
  }

  it("picks the 14–30 day window and names the primary artist", () => {
    const out = run([
      fan("active", { last_active_date: dateDaysAgo(3) }),
      fan("edge14", { last_active_date: dateDaysAgo(14) }),
      fan("lapsed", { last_active_date: dateDaysAgo(21) }),
      fan("edge30", { last_active_date: dateDaysAgo(30) }),
      fan("dormant", { last_active_date: dateDaysAgo(31) }),
      fan("never", {}),
    ]);
    assert.deepEqual(
      out.map((c) => c.id),
      ["edge14", "lapsed", "edge30"],
    );
    const lapsed = out.find((c) => c.id === "lapsed");
    assert.equal(lapsed?.artistSlug, "artist-one");
    assert.equal(lapsed?.bucket, "lapsed");
    assert.equal(lapsed?.daysSinceActivity, 21);
    assert.equal(lapsed?.firstName, "lapsed");
  });

  it("falls back to the default community for a fan with no membership", () => {
    const out = run([fan("nomember", { last_active_date: dateDaysAgo(20) })]);
    assert.equal(out.length, 1);
    assert.equal(out[0].artistSlug, DEFAULT_COMMUNITY_SLUG);
    assert.equal(primaryArtistSlug(undefined, "fallback"), "fallback");
    assert.equal(primaryArtistSlug([], "fallback"), "fallback");
    assert.equal(primaryArtistSlug(["x", "y"], "fallback"), "x");
  });

  it("excludes internal fans, opt-outs, recent nudges and missing emails", () => {
    const base = { last_active_date: dateDaysAgo(20) };
    const out = run(
      [
        fan("lapsed", base),
        fan("internal", { ...base, is_internal: true }),
        fan("optout", base),
        fan("nudged", base),
        fan("noemail", { ...base, email: "  " }),
        fan("nullemail", { ...base, email: null }),
      ],
      { recentlyNudged: new Set(["nudged"]), digestOptOut: new Set(["optout"]) },
    );
    assert.deepEqual(out.map((c) => c.id), ["lapsed"]);
  });

  it("uses the newest signal, so a ledger row inside 14 days keeps a fan active", () => {
    const out = run([fan("lapsed", { last_active_date: dateDaysAgo(20) })], {
      lastActivity: latestActivityByFan([{ fan_id: "lapsed", at: daysAgo(2) }]),
    });
    assert.equal(out.length, 0);
  });

  it("defaults a blank first name to 'there'", () => {
    const out = run([fan("lapsed", { last_active_date: dateDaysAgo(20), first_name: "  " })]);
    assert.equal(out[0].firstName, "there");
  });
});

describe("countBuckets", () => {
  it("counts every fan once", () => {
    const counts = countBuckets(
      [
        fan("a", { last_active_date: dateDaysAgo(1) }),
        fan("b", { last_active_date: dateDaysAgo(20) }),
        fan("c", { last_active_date: dateDaysAgo(50) }),
        fan("d"),
      ],
      new Map(),
      NOW,
    );
    assert.deepEqual(counts, { active: 1, lapsed: 1, dormant: 1, unknown: 1 });
  });
});

describe("groupMemberships", () => {
  it("keeps row order and dedupes slugs per fan", () => {
    const grouped = groupMemberships([
      { fan_id: "a", community_id: "one" },
      { fan_id: "a", community_id: "two" },
      { fan_id: "a", community_id: "one" },
      { fan_id: "", community_id: "x" },
      { fan_id: "b", community_id: "" },
    ]);
    assert.deepEqual(grouped.get("a"), ["one", "two"]);
    assert.equal(grouped.has("b"), false);
  });
});

describe("recentlyNudgedIds", () => {
  it("applies the 30-day resend window to notification_log.sent_at", () => {
    const ids = recentlyNudgedIds(
      [
        { fan_id: "fresh", sent_at: daysAgo(1) },
        { fan_id: "edge", sent_at: daysAgo(LAPSED_RESEND_DAYS) },
        { fan_id: "old", sent_at: daysAgo(LAPSED_RESEND_DAYS + 1) },
        { fan_id: "bad", sent_at: "nope" },
        { fan_id: "", sent_at: daysAgo(1) },
      ],
      NOW,
    );
    assert.deepEqual([...ids].sort(), ["edge", "fresh"]);
  });
});

describe("keys and cutoffs", () => {
  it("builds the per-day dedup key and ISO cutoffs", () => {
    assert.equal(lapsedDedupKey(NOW), `${LAPSED_NUDGE_KIND}:2026-10-29`);
    assert.equal(lapsedResendCutoffIso(NOW), daysAgo(LAPSED_RESEND_DAYS));
    assert.equal(lapsedActivityCutoffIso(NOW), daysAgo(LAPSED_MAX_DAYS + 1));
  });
});
