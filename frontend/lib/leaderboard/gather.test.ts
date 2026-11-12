import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACTIVITY_KINDS,
  aggregateScores,
  rankScores,
  SCORE_WEIGHTS,
  scoreLegend,
  type ActivityEvent,
} from "./score.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const gatherTs = readRepo("./gather.ts");
const leaderboardPageTsx = readRepo("../../app/artists/[slug]/leaderboard/page.tsx");

describe("SCORE_WEIGHTS (Sprint 2 reweight)", () => {
  it("matches the agreed ladder", () => {
    assert.deepEqual(SCORE_WEIGHTS, {
      checkin: 5,
      rsvp: 5,
      share: 3,
      post: 3,
      comment: 2,
      reaction: 1,
      redemption: 0,
    });
  });

  it("redemptions no longer score", () => {
    assert.equal(SCORE_WEIGHTS.redemption, 0);
    assert.ok(!scoreLegend().includes("redemption"));
  });

  it("every kind the gather module pushes is a known kind", () => {
    const pushed = [...gatherTs.matchAll(/kind: "([a-z]+)"/g)].map((m) => m[1]);
    assert.ok(pushed.length >= 6, "gather should push at least six kinds");
    for (const k of pushed) assert.ok(ACTIVITY_KINDS.includes(k as never), k);
    for (const k of ["reaction", "comment", "rsvp", "post", "checkin", "share"]) {
      assert.ok(pushed.includes(k), `gather must push ${k}`);
    }
    assert.ok(!pushed.includes("redemption"), "gather must not count redemptions");
    assert.ok(!gatherTs.includes('from("reward_redemptions")'));
  });
});

describe("aggregateScores is pure and weight-driven", () => {
  const events: ActivityEvent[] = [
    { fanId: "a", kind: "reaction" },
    { fanId: "a", kind: "reaction" },
    { fanId: "a", kind: "comment" },
    { fanId: "b", kind: "checkin" },
    { fanId: "b", kind: "share" },
    { fanId: "c", kind: "post" },
    { fanId: "c", kind: "rsvp" },
    { fanId: "c", kind: "redemption" },
  ];

  it("sums weights per fan and keeps per-kind counts", () => {
    const scores = aggregateScores(events);
    assert.equal(scores.get("a")?.score, 2 * 1 + 2);
    assert.equal(scores.get("a")?.counts.reaction, 2);
    assert.equal(scores.get("a")?.counts.comment, 1);
    assert.equal(scores.get("b")?.score, 5 + 3);
    assert.equal(scores.get("c")?.score, 3 + 5 + 0);
    assert.equal(scores.get("c")?.counts.redemption, 1);
  });

  it("does not mutate its input and is deterministic", () => {
    const copy = structuredClone(events);
    const first = aggregateScores(events);
    const second = aggregateScores(events);
    assert.deepEqual(events, copy);
    assert.deepEqual([...first.entries()], [...second.entries()]);
  });

  it("a fan whose only activity is a redemption scores 0 (and still appears)", () => {
    const scores = aggregateScores([{ fanId: "z", kind: "redemption" }]);
    assert.equal(scores.get("z")?.score, 0);
  });

  it("ignores events with an empty fan id or unknown kind", () => {
    const scores = aggregateScores([
      { fanId: "", kind: "reaction" },
      { fanId: "x", kind: "bogus" as never },
    ]);
    assert.equal(scores.size, 0);
  });

  it("rankScores sorts by score desc, then fan id for a stable tie-break", () => {
    const ranked = rankScores(aggregateScores(events)).map(([id]) => id);
    assert.deepEqual(ranked, ["b", "c", "a"]);
    const tie = rankScores(
      aggregateScores([
        { fanId: "m", kind: "reaction" },
        { fanId: "k", kind: "reaction" },
      ]),
    ).map(([id]) => id);
    assert.deepEqual(tie, ["k", "m"]);
  });
});

describe("leaderboard page legend is rendered from SCORE_WEIGHTS", () => {
  it("page imports scoreLegend and no longer hard-codes the old weights", () => {
    assert.ok(leaderboardPageTsx.includes("scoreLegend("));
    assert.ok(!leaderboardPageTsx.includes("10 pts per"));
    assert.ok(!leaderboardPageTsx.includes("3 pts per comment"));
  });

  it("legend lists the scoring kinds in weight order", () => {
    assert.equal(
      scoreLegend(),
      "5 pts per check-in · 5 pts per RSVP · 3 pts per share · 3 pts per post · 2 pts per comment · 1 pt per reaction",
    );
  });
});

describe("gather keeps the honesty + exclusion rules", () => {
  it("still drops is_internal fans before ranks are assigned", () => {
    assert.ok(gatherTs.includes('.eq("is_internal", false)'));
  });
  it("still scopes RSVPs by rsvp_at (no created_at on event_rsvps)", () => {
    assert.ok(gatherTs.includes('.gte("rsvp_at", monthStartIso)'));
  });
  it("counts only fan-started posts (kind = post)", () => {
    assert.ok(gatherTs.includes('.eq("kind", "post")'));
  });
  it("counts shares from the ledger scoped to the community", () => {
    assert.ok(gatherTs.includes('.eq("source", "social_share")'));
    assert.ok(gatherTs.includes('.eq("community_id", opts.artistSlug)'));
  });
});
