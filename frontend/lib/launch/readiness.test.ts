import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeReadiness,
  isPlaceholderText,
  MIN_POSTS,
  MIN_SOCIALS,
  MIN_TEAM,
  type ReadinessInput,
} from "./readiness.ts";

function complete(): ReadinessInput {
  return {
    slug: "raelynn",
    profile: {
      name: "RaeLynn",
      tagline: "Country, heart-first.",
      bio: "RaeLynn is a Texas-born country singer-songwriter with a decade of hits.",
      heroImage: "/images/raelynn.jpg",
      hasKeyArt: true,
      socialCount: 3,
    },
    upcomingEvents: 2,
    posts: 5,
    activeRewards: 4,
    activePreSaves: 0,
    teamMembers: 2,
    pushSubscribedFollowers: 0,
    foundersEnabled: true,
    founderCap: 100,
  };
}

const byKey = (input: ReadinessInput) =>
  Object.fromEntries(computeReadiness(input).items.map((i) => [i.key, i]));

describe("isPlaceholderText", () => {
  it("treats the seed bios, blanks and short strings as placeholders", () => {
    assert.equal(isPlaceholderText("Placeholder bio — awaiting final copy from marketing."), true);
    assert.equal(isPlaceholderText(null), true);
    assert.equal(isPlaceholderText("   "), true);
    assert.equal(isPlaceholderText("Short"), true);
    assert.equal(isPlaceholderText("Bio coming soon, check back later!"), true);
  });
  it("accepts a real bio", () => {
    assert.equal(isPlaceholderText(complete().profile.bio), false);
  });
});

describe("computeReadiness", () => {
  it("is ready when every required item is done; optional/info never block", () => {
    const r = computeReadiness(complete());
    assert.equal(r.ready, true);
    assert.equal(r.percent, 100);
    assert.equal(r.requiredDone, r.requiredTotal);
    const items = byKey(complete());
    assert.equal(items.presave.done, false);
    assert.equal(items.presave.kind, "optional");
    assert.equal(items.push.done, false);
    assert.equal(items.push.kind, "info");
  });

  it("required set is exactly the launch gates, each with a fix link", () => {
    const r = computeReadiness(complete());
    assert.deepEqual(
      r.items.filter((i) => i.kind === "required").map((i) => i.key),
      ["profile", "socials", "event", "posts", "reward", "team", "checkin"],
    );
    for (const i of r.items) assert.match(i.href, /^\//, `${i.key} href`);
  });

  it("flags a placeholder bio and names what is missing", () => {
    const input = complete();
    input.profile.bio = "Placeholder bio — awaiting assets from Box drop.";
    input.profile.tagline = "";
    const p = byKey(input).profile;
    assert.equal(p.done, false);
    assert.equal(p.detail, "Missing: tagline, bio");
    assert.equal(p.href, "/admin/artists/raelynn");
    assert.equal(computeReadiness(input).ready, false);
  });

  it("hero image OR processed key-art satisfies the art check", () => {
    const a = complete();
    a.profile.heroImage = null;
    a.profile.hasKeyArt = true;
    assert.equal(byKey(a).profile.done, true);
    const b = complete();
    b.profile.heroImage = null;
    b.profile.hasKeyArt = false;
    assert.equal(byKey(b).profile.done, false);
    assert.match(byKey(b).profile.detail, /hero image/);
  });

  it("thresholds: socials, posts, team, events, rewards", () => {
    const s = complete();
    s.profile.socialCount = MIN_SOCIALS - 1;
    assert.equal(byKey(s).socials.done, false);
    assert.equal(byKey(s).socials.detail, `${MIN_SOCIALS - 1} of ${MIN_SOCIALS} linked`);

    const p = complete();
    p.posts = MIN_POSTS - 1;
    assert.equal(byKey(p).posts.done, false);
    assert.equal(byKey(p).posts.href, "/artist-portal/community");

    const t = complete();
    t.teamMembers = MIN_TEAM - 1;
    assert.equal(byKey(t).team.done, false);
    assert.equal(byKey(t).team.href, "/artist-portal/team");

    const e = complete();
    e.upcomingEvents = 0;
    assert.equal(byKey(e).event.done, false);
    assert.equal(byKey(e).event.href, "/artist-portal/events");

    const w = complete();
    w.activeRewards = 0;
    assert.equal(byKey(w).reward.done, false);
  });

  it("check-in QR is always available and links to the QR page", () => {
    const c = byKey(complete()).checkin;
    assert.equal(c.done, true);
    assert.equal(c.href, "/artist-portal/checkin-qr");
  });

  it("progress counts required items only", () => {
    const input = complete();
    input.posts = 0;
    input.teamMembers = 0;
    const r = computeReadiness(input);
    assert.equal(r.requiredTotal, 7);
    assert.equal(r.requiredDone, 5);
    assert.equal(r.percent, 71);
    assert.equal(r.ready, false);
  });

  it("founders and push are informational with state in the detail", () => {
    const off = complete();
    off.foundersEnabled = false;
    off.founderCap = 0;
    assert.equal(byKey(off).founders.done, false);
    assert.match(byKey(off).founders.detail, /Off/);
    assert.equal(computeReadiness(off).ready, true);

    const push = complete();
    push.pushSubscribedFollowers = 1;
    assert.equal(byKey(push).push.detail, "1 follower subscribed");
  });
});
