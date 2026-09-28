import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
  MAX_LIFETIME_DISMISSALS,
  NEW_FAN_GRACE_MS,
  PAGE_VIEWS_TO_RESURFACE,
  RESURFACE_COOLDOWN_MS,
  canResurfacePremiumUpgradePrompt,
  dismissPremiumUpgradePrompt,
  isInNewFanGrace,
  isPremiumUpgradePromptHiddenPath,
  parsePremiumUpgradePromptState,
  serializePremiumUpgradePromptState,
  shouldShowPremiumUpgradePrompt,
  stampPremiumUpgradeFirstSeen,
  type PremiumUpgradePromptState,
} from "./premium-upgrade-prompt.ts";
import {
  claimPromptSlot,
  getActivePromptSlot,
  isCookieConsentResolved,
  isPromptSlotFree,
  parseCookieConsentChoice,
  releasePromptSlot,
  resetPromptSlotForTests,
  subscribePromptSlot,
} from "./prompt-slot.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-27T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

/** A fan this device first saw a month ago. */
const SETTLED: PremiumUpgradePromptState = {
  ...EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
  firstSeenAt: iso(NOW - 30 * DAY_MS),
};

function show(
  state: PremiumUpgradePromptState,
  extra: { pathname?: string; now?: number; accountCreatedAt?: string | null } = {},
): boolean {
  return shouldShowPremiumUpgradePrompt({
    signedIn: true,
    isPremium: false,
    state,
    pathname: extra.pathname ?? "/",
    now: extra.now ?? NOW,
    accountCreatedAt: extra.accountCreatedAt,
  });
}

/** Dismissed `count` times, last at `lastAt`, with enough views to resurface. */
function dismissedState(count: number, lastAt: number): PremiumUpgradePromptState {
  return {
    ...SETTLED,
    dismissed: true,
    views: PAGE_VIEWS_TO_RESURFACE,
    dismissCount: count,
    lastDismissedAt: iso(lastAt),
  };
}

describe("Premium prompt route suppression", () => {
  const blocked = [
    "/admin",
    "/admin/super-fans",
    "/artist-portal",
    "/artist-portal/raelynn/posts",
    "/account/billing",
    "/terms",
    "/privacy",
    "/rewards-terms",
    "/cookie-policy",
    "/cancellation-refund",
    "/dmca",
    "/onboarding",
  ];
  for (const pathname of blocked) {
    it(`never shows on ${pathname}`, () => {
      assert.equal(isPremiumUpgradePromptHiddenPath(pathname), true);
      assert.equal(show(SETTLED, { pathname }), false);
    });
  }

  it("still shows on normal fan pages", () => {
    assert.equal(show(SETTLED, { pathname: "/artists/raelynn/community" }), true);
    assert.equal(show(SETTLED, { pathname: "/me" }), true);
  });
});

describe("Premium prompt first-day grace", () => {
  it("hides for an account created less than a day ago", () => {
    assert.equal(
      show(SETTLED, { accountCreatedAt: iso(NOW - 2 * 60 * 60 * 1000) }),
      false,
    );
  });

  it("shows once the account is older than a day", () => {
    assert.equal(
      show(EMPTY_PREMIUM_UPGRADE_PROMPT_STATE, {
        accountCreatedAt: iso(NOW - NEW_FAN_GRACE_MS - 1),
      }),
      true,
    );
  });

  it("falls back to firstSeenAt when created_at is unknown", () => {
    const fresh = { ...EMPTY_PREMIUM_UPGRADE_PROMPT_STATE, firstSeenAt: iso(NOW - 60_000) };
    assert.equal(show(fresh), false);
    assert.equal(show(fresh, { now: NOW + NEW_FAN_GRACE_MS }), true);
  });

  it("treats a fan with no dates at all as brand new", () => {
    assert.equal(
      isInNewFanGrace({ now: NOW, accountCreatedAt: null, firstSeenAt: null }),
      true,
    );
    assert.equal(show(EMPTY_PREMIUM_UPGRADE_PROMPT_STATE), false);
  });

  it("stamps firstSeenAt once and keeps the first stamp", () => {
    const stamped = stampPremiumUpgradeFirstSeen(EMPTY_PREMIUM_UPGRADE_PROMPT_STATE, NOW);
    assert.equal(stamped.firstSeenAt, iso(NOW));
    const again = stampPremiumUpgradeFirstSeen(stamped, NOW + DAY_MS);
    assert.equal(again.firstSeenAt, iso(NOW));
  });
});

describe("Premium prompt dismissal cap and cooldown", () => {
  it("counts each dismissal and records when it happened", () => {
    const once = dismissPremiumUpgradePrompt(SETTLED, NOW);
    const twice = dismissPremiumUpgradePrompt(once, NOW + DAY_MS);
    assert.equal(once.dismissCount, 1);
    assert.equal(twice.dismissCount, 2);
    assert.equal(twice.lastDismissedAt, iso(NOW + DAY_MS));
    assert.equal(twice.views, 0);
  });

  it("stays hidden inside the 7-day cooldown even with enough views", () => {
    const state = dismissedState(1, NOW - (RESURFACE_COOLDOWN_MS - 1));
    assert.equal(show(state), false);
  });

  it("can come back once 7 days have passed and views are met", () => {
    const state = dismissedState(1, NOW - RESURFACE_COOLDOWN_MS);
    assert.equal(show(state), true);
    assert.equal(
      show({ ...state, views: PAGE_VIEWS_TO_RESURFACE - 1 }),
      false,
    );
  });

  it("stops for good after 3 lifetime dismissals", () => {
    assert.equal(MAX_LIFETIME_DISMISSALS, 3);
    const longAgo = NOW - 365 * DAY_MS;
    assert.equal(show(dismissedState(2, longAgo)), true);
    assert.equal(show(dismissedState(3, longAgo)), false);
    assert.equal(canResurfacePremiumUpgradePrompt(dismissedState(4, longAgo), NOW), false);
  });

  it("walks a fan through three dismissals and then never again", () => {
    let state = SETTLED;
    let now = NOW;
    for (let i = 0; i < MAX_LIFETIME_DISMISSALS; i += 1) {
      assert.equal(show(state, { now }), true, `shows before dismissal ${i + 1}`);
      state = dismissPremiumUpgradePrompt(state, now);
      now += RESURFACE_COOLDOWN_MS;
      state = { ...state, views: PAGE_VIEWS_TO_RESURFACE };
    }
    assert.equal(show(state, { now: now + 365 * DAY_MS }), false);
  });

  it("round-trips the new fields through storage", () => {
    const state = dismissedState(2, NOW);
    const parsed = parsePremiumUpgradePromptState(
      serializePremiumUpgradePromptState(state),
    );
    assert.deepEqual(parsed, state);
  });

  it("reads legacy stored state as one dismissal with no timestamp", () => {
    const legacy = parsePremiumUpgradePromptState(
      JSON.stringify({ dismissed: true, views: 3, premiumLocked: false }),
    );
    assert.equal(legacy.dismissCount, 1);
    assert.equal(legacy.lastDismissedAt, null);
    assert.equal(legacy.firstSeenAt, null);
  });

  it("ignores junk counts and dates", () => {
    const junk = parsePremiumUpgradePromptState(
      JSON.stringify({
        dismissed: false,
        views: 0,
        dismissCount: "lots",
        lastDismissedAt: "not a date",
        firstSeenAt: 42,
      }),
    );
    assert.equal(junk.dismissCount, 0);
    assert.equal(junk.lastDismissedAt, null);
    assert.equal(junk.firstSeenAt, null);
  });
});

describe("one prompt at a time", () => {
  afterEach(() => resetPromptSlotForTests());

  it("lets the first prompt claim the slot and blocks the other", () => {
    assert.equal(getActivePromptSlot(), null);
    assert.equal(claimPromptSlot("install"), true);
    assert.equal(getActivePromptSlot(), "install");
    assert.equal(isPromptSlotFree("premium", getActivePromptSlot()), false);
    assert.equal(claimPromptSlot("premium"), false);
    assert.equal(getActivePromptSlot(), "install");
  });

  it("frees the slot on release, and ignores release by a non-owner", () => {
    claimPromptSlot("premium");
    releasePromptSlot("install");
    assert.equal(getActivePromptSlot(), "premium");
    releasePromptSlot("premium");
    assert.equal(getActivePromptSlot(), null);
    assert.equal(claimPromptSlot("install"), true);
  });

  it("notifies subscribers only when the owner changes", () => {
    let calls = 0;
    const unsubscribe = subscribePromptSlot(() => {
      calls += 1;
    });
    claimPromptSlot("premium");
    claimPromptSlot("premium");
    releasePromptSlot("premium");
    unsubscribe();
    claimPromptSlot("install");
    assert.equal(calls, 2);
  });
});

describe("cookie consent choice", () => {
  it("reads accept, decline and unanswered", () => {
    assert.equal(parseCookieConsentChoice(null), null);
    assert.equal(parseCookieConsentChoice(JSON.stringify({ choice: "accept" })), "accept");
    assert.equal(parseCookieConsentChoice(JSON.stringify({ choice: "decline" })), "decline");
  });

  it("never treats unknown or broken values as Accept", () => {
    assert.equal(parseCookieConsentChoice("yes"), "decline");
    assert.equal(parseCookieConsentChoice(JSON.stringify({ choice: "maybe" })), "decline");
  });

  it("counts any answer as resolved", () => {
    assert.equal(isCookieConsentResolved(null), false);
    assert.equal(isCookieConsentResolved(JSON.stringify({ choice: "decline" })), true);
  });
});

describe("prompt wiring", () => {
  const banner = readRepo("../components/cookie-banner.tsx");
  const install = readRepo("../components/install-prompt.tsx");
  const premium = readRepo("../components/premium-upgrade-prompt.tsx");
  const layout = readRepo("../app/layout.tsx");
  const setRef = readRepo("../app/invite/[code]/set-ref-cookie.tsx");
  const signup = readRepo("../app/signup/signup-form.tsx");

  it("cookie banner offers Decline and clears the referral cookie", () => {
    assert.match(banner, />\s*Decline\s*</);
    assert.match(banner, /choice/);
    assert.match(banner, /REFERRAL_COOKIE_NAME = "fanengage_ref"/);
    assert.match(banner, /max-age=0/);
    assert.match(banner, /sm:hidden/);
  });

  it("referral cookie is only written after Accept", () => {
    assert.match(setRef, /if \(!hasAcceptedCookieConsent\(\)\) return;/);
    assert.match(signup, /if \(!hasAcceptedCookieConsent\(\)\) return;/);
  });

  it("install prompt waits for consent and shares the prompt slot", () => {
    assert.match(install, /isCookieConsentResolved\(consentRaw\)/);
    assert.match(install, /claimPromptSlot\("install"\)/);
    assert.match(install, /releasePromptSlot\("install"\)/);
    assert.match(install, /activeSlot === "install"/);
  });

  it("Premium prompt uses the slot, grace and first-seen stamp", () => {
    assert.match(premium, /claimPromptSlot\("premium"\)/);
    assert.match(premium, /activeSlot === "premium"/);
    assert.match(premium, /accountCreatedAt/);
    assert.match(premium, /stampPremiumUpgradeFirstSeen/);
    assert.match(layout, /accountCreatedAt=\{user\?\.created_at \?\? null\}/);
  });
});
