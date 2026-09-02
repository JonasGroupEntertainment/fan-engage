import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  FIRST_72H_BODY,
  FIRST_72H_STEPS,
  FIRST_72H_TITLE,
  REFERRAL_REWARD_LADDER,
  first72hAllDone,
  first72hFromFanState,
  shouldShowFirstSessionChecklist,
} from "./first-72h.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const referrals = readRepo("../app/referrals/page.tsx");
const home = readRepo("../app/page.tsx");
const onboarding = readRepo("../app/onboarding/page.tsx");
const checklist = readRepo("../components/first-session-checklist.tsx");
const loginPage = readRepo("../app/login/page.tsx");
const authDoors = readRepo("./auth-doors.ts");

describe("First 72 hours program", () => {
  it("reuses the referrals First 72h copy and reward ladder", () => {
    assert.equal(FIRST_72H_TITLE, "First 72 hours");
    assert.equal(
      FIRST_72H_BODY,
      "Follow one artist, earn a first badge, then invite one friend while the experience is fresh.",
    );
    assert.deepEqual(
      REFERRAL_REWARD_LADDER.map((s) => ({ level: s.level, reward: s.reward })),
      [
        { level: "1 referral", reward: "+150 pts" },
        { level: "3 referrals", reward: "Recruiter badge" },
        { level: "5 referrals", reward: "Connector badge" },
        { level: "10 referrals", reward: "Ambassador badge" },
      ],
    );
    assert.match(referrals, /FIRST_72H_TITLE|FIRST_72H_BODY/);
    assert.match(referrals, /REFERRAL_REWARD_LADDER/);
  });

  it("ships the post-join ladder: profile, follow/join, first badge or points move, invite", () => {
    assert.deepEqual(
      FIRST_72H_STEPS.map((s) => s.id),
      ["profile", "follow", "badge", "invite"],
    );
    assert.match(FIRST_72H_STEPS[0].title, /profile/i);
    assert.match(FIRST_72H_STEPS[1].title, /follow|community/i);
    assert.match(FIRST_72H_STEPS[2].title, /badge|redeem|points/i);
    assert.match(FIRST_72H_STEPS[3].title, /invite|friend/i);
    assert.equal(FIRST_72H_STEPS[0].href, "/onboarding");
    assert.equal(FIRST_72H_STEPS[1].href, "/artists");
    assert.equal(FIRST_72H_STEPS[3].href, "/referrals");
  });

  it("marks steps from fan state without inventing a second program", () => {
    const fresh = first72hFromFanState({
      hasProfile: false,
      followCount: 0,
      badgeCount: 0,
      referralCount: 0,
    });
    assert.equal(first72hAllDone(fresh), false);
    assert.equal(shouldShowFirstSessionChecklist(fresh, false), true);
    assert.equal(shouldShowFirstSessionChecklist(fresh, true), false);

    const joined = first72hFromFanState({
      hasProfile: true,
      followCount: 1,
      badgeCount: 0,
      referralCount: 0,
      joinedCommunity: true,
    });
    assert.equal(joined.profileDone, true);
    assert.equal(joined.followDone, true);
    assert.equal(joined.badgeDone, false);
    assert.equal(joined.inviteDone, false);

    const moved = first72hFromFanState({
      hasProfile: true,
      followCount: 0,
      badgeCount: 0,
      referralCount: 0,
      redemptionCount: 1,
    });
    assert.equal(moved.badgeDone, true);

    const complete = first72hFromFanState({
      hasProfile: true,
      followCount: 1,
      badgeCount: 1,
      referralCount: 1,
    });
    assert.equal(first72hAllDone(complete), true);
    assert.equal(shouldShowFirstSessionChecklist(complete, false), false);
  });

  it("shows the same checklist on signed-in home and onboarding", () => {
    assert.match(home, /FirstSessionChecklist|first-session-checklist/);
    assert.match(onboarding, /FirstSessionChecklist|first-session-checklist/);
    assert.match(checklist, /FIRST_72H_TITLE/);
    assert.match(checklist, /FIRST_72H_STEPS/);
    assert.doesNotMatch(onboarding, /Supernova Weekend/);
    assert.doesNotMatch(onboarding, /Marketplace Passport/);
    assert.doesNotMatch(home, /jgos\.io/);
    assert.doesNotMatch(onboarding, /jgos\.io/);
    assert.doesNotMatch(checklist, /jgos\.io/);
  });

  it("does not re-open magic-link or forgot-password", () => {
    assert.match(authDoors, /NEXT_PUBLIC_MAGIC_LINK_ENABLED/);
    assert.match(authDoors, /NEXT_PUBLIC_FORGOT_PASSWORD_ENABLED/);
    assert.match(loginPage, /isMagicLinkEnabled\(\)/);
    assert.match(loginPage, /isForgotPasswordEnabled\(\)/);
  });
});
