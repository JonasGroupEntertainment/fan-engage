import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ACTIVITY_POINTS,
  GUEST_FORBIDDEN_PHRASES,
  LAUNCH_REWARD_TITLES,
  REFERRAL_JOIN_POINTS,
  RESERVED_REWARD_TITLES,
  canonicalLaunchTitle,
  isMisplacedNelliesOffer,
  isReservedRewardTitle,
  shouldListLaunchReward,
} from "./launch-catalog.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const migrationSql = readRepo(
  "../../supabase/migrations/0051_launch_catalog_and_activity_points.sql",
);
const onboardTs = readRepo("../app/api/fan-engage/onboard/route.ts");
const inviteTs = readRepo("../app/invite/[code]/page.tsx");

const guestSurfaces = {
  premium: readRepo("../app/premium/page.tsx"),
  referrals: readRepo("../app/referrals/page.tsx"),
  rewards: readRepo("../app/rewards/page.tsx"),
  homepage: readRepo("../components/signed-out-landing.tsx"),
  paywall: readRepo("../components/premium-paywall.tsx"),
  community: readRepo("../app/artists/[slug]/community/page.tsx"),
  poll: readRepo("../app/artists/[slug]/community/poll-block.tsx"),
  seed: readRepo("../app/admin/community/seed/actions.ts"),
};

describe("launch catalog listing", () => {
  it("does not list reserved SKUs, including the live RaeLynn hold set", () => {
    for (const title of [
      "Early Album Access",
      "Personal Voice Note",
      "Merch Discount Code",
      "Video Shoutout",
      "Limited Edition Tour Tee",
      "Presale Password Unlock",
      "Meet & Greet Pass",
      "Backstage Tour",
      "VIP Ticket Upgrade",
      "Soundcheck Access",
      "Merch Bundle with Ticket",
      "Signed Physical Merch",
      "Personalized Shoutout Video",
    ]) {
      assert.equal(
        shouldListLaunchReward(
          { title, community_id: "raelynn", active: true },
          { signedIn: true },
        ),
        false,
        title,
      );
      assert.equal(isReservedRewardTitle(title), true, title);
    }
    assert.ok(RESERVED_REWARD_TITLES.includes("Limited Edition Tour Tee"));
  });

  it("hides Behind-the-Song Video without a clip", () => {
    assert.equal(
      shouldListLaunchReward(
        {
          title: "Behind-the-Song Video",
          community_id: "raelynn",
          active: true,
          clip_url: null,
        },
        { signedIn: true },
      ),
      false,
    );
    assert.equal(
      shouldListLaunchReward(
        {
          title: "Behind-the-Song Video",
          community_id: "raelynn",
          active: true,
          clip_url: "https://cdn.example/bts.mp4",
        },
        { signedIn: true },
      ),
      true,
    );
  });

  it("keeps launch SKUs signed-in-only and Fan Spotlight in-app", () => {
    for (const title of LAUNCH_REWARD_TITLES) {
      if (title === "Behind-the-Song Video") continue;
      assert.equal(
        shouldListLaunchReward(
          { title, community_id: "raelynn", active: true, clip_url: "x" },
          { signedIn: false },
        ),
        false,
        title,
      );
    }
    assert.equal(
      shouldListLaunchReward(
        { title: "Fan Spotlight", community_id: "raelynn", active: true },
        { signedIn: true },
      ),
      true,
    );
    assert.equal(canonicalLaunchTitle("Exclusive Phone Wallpaper Pack"), "Phone Wallpaper");
  });

  it("flags the misplaced Nellie Bourbon offer", () => {
    assert.equal(
      isMisplacedNelliesOffer("Nellie's Bourbon and Cigar event"),
      true,
    );
  });
});

describe("guest signed-out copy does not leak held items", () => {
  it("strips merch, store credit, livestream, vinyl prizes, soundcheck, presale, and M&G", () => {
    for (const [name, src] of Object.entries(guestSurfaces)) {
      const lower = src.toLowerCase();
      for (const phrase of GUEST_FORBIDDEN_PHRASES) {
        assert.equal(
          lower.includes(phrase),
          false,
          `${name} still contains “${phrase}”`,
        );
      }
    }
  });

  it("does not put the raffle on a named date or a Gold/Platinum VIP substitute", () => {
    assert.doesNotMatch(guestSurfaces.rewards, /VIP soundcheck/i);
    assert.doesNotMatch(guestSurfaces.rewards, /presale tickets/i);
    assert.doesNotMatch(guestSurfaces.rewards, /meet & greet/i);
    assert.doesNotMatch(guestSurfaces.homepage, /VIP Moment Raffle/);
    assert.doesNotMatch(migrationSql, /named date|June|July 1/i);
    assert.match(
      migrationSql,
      /next available show/,
    );
    assert.match(
      readRepo("../lib/onboarding/init.ts"),
      /next available show/,
    );
    assert.doesNotMatch(guestSurfaces.seed, /signed vinyl|merch prizes/i);
  });
});

describe("referral pays on join, not click", () => {
  it("awards referrer +150 from onboard and friend +50 from the verified-join trigger only", () => {
    assert.match(onboardTs, /REFERRAL_JOIN_POINTS\.referrer/);
    assert.match(onboardTs, /awardPoints/);
    assert.match(onboardTs, /status:\s*"verified"/);
    assert.equal(REFERRAL_JOIN_POINTS.referrer, 150);
    assert.equal(REFERRAL_JOIN_POINTS.friend, 50);
    assert.match(migrationSql, /try_award_referral_friend_points/);
    assert.match(migrationSql, /values \(p_referred_id, 50,/);
    assert.doesNotMatch(
      migrationSql,
      /try_award_referral_friend_points[\s\S]*150/,
    );
    assert.doesNotMatch(inviteTs, /awardPoints|points_ledger/);
  });
});

describe("activity points replace 2/1 triggers and do not layer", () => {
  it("sets comment +10 cap 5, poll +10 cap 3, share +15 cap 3", () => {
    assert.equal(ACTIVITY_POINTS.comment, 10);
    assert.equal(ACTIVITY_POINTS.commentDailyCap, 5);
    assert.equal(ACTIVITY_POINTS.poll, 10);
    assert.equal(ACTIVITY_POINTS.pollDailyCap, 3);
    assert.equal(ACTIVITY_POINTS.share, 15);
    assert.equal(ACTIVITY_POINTS.shareDailyCap, 3);
    assert.match(migrationSql, /v_award\s+int := 10;/);
    assert.match(migrationSql, /v_cap\s+int := 5;/);
    assert.match(migrationSql, /v_cap\s+int := 3;/);
    assert.match(migrationSql, /v_award int := 15;/);
    assert.match(
      migrationSql,
      /drop trigger if exists community_comments_award_points/,
    );
    assert.match(
      migrationSql,
      /drop trigger if exists community_poll_votes_award_points/,
    );
    assert.doesNotMatch(migrationSql, /base_award\s+int\s+:=\s+2/);
    assert.doesNotMatch(migrationSql, /base_award\s+int\s+:=\s+1/);
    assert.doesNotMatch(onboardTs, /award_comment_points_for_id/);
    assert.match(guestSurfaces.community, /comments \+10 pts/);
    assert.match(guestSurfaces.poll, /\+10 pts/);
    assert.doesNotMatch(guestSurfaces.poll, /\+1 pt/);
  });

  it("changes the live share 50 to 15 and does not uncap challenges", () => {
    assert.match(migrationSql, /set point_value = 15/);
    assert.match(migrationSql, /kind = 'share'/);
    assert.doesNotMatch(
      migrationSql,
      /award_challenge_entry_points/,
    );
  });

  it("unpublishes reserved catalog rows instead of deleting them", () => {
    assert.match(migrationSql, /set active = false/);
    assert.doesNotMatch(migrationSql, /delete from public\.rewards_catalog/i);
    assert.match(migrationSql, /Early Album Access/);
    assert.match(migrationSql, /Limited Edition Tour Tee/);
    assert.match(migrationSql, /bourbon and cigar/);
  });
});
