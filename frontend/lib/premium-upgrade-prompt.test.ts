import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isPremium } from "./entitlements-core.ts";
import {
  COOKIE_BANNER_HIDE_PREFIXES,
  EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
  FIRST_SHOW_DELAY_MS_MAX,
  FIRST_SHOW_DELAY_MS_MIN,
  PAGE_VIEWS_TO_RESURFACE,
  PREMIUM_UPGRADE_PROMPT_COPY,
  PREMIUM_UPGRADE_PROMPT_HIDE_PREFIXES,
  PREMIUM_UPGRADE_PROMPT_STORAGE_KEY,
  applyPremiumEntitlementToPromptState,
  dismissPremiumUpgradePrompt,
  incrementPremiumUpgradePromptViews,
  loadPremiumUpgradePromptState,
  parsePremiumUpgradePromptState,
  pickFirstShowDelayMs,
  recordPremiumUpgradeNavigation,
  savePremiumUpgradePromptState,
  shouldHidePremiumUpgradeForEntitlement,
  shouldShowPremiumUpgradePrompt,
  type PremiumUpgradePromptState,
} from "./premium-upgrade-prompt.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

function memoryStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key)
        ? store[key]
        : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    store,
  };
}

function waiting(views = 0): PremiumUpgradePromptState {
  return { dismissed: true, views, premiumLocked: false };
}

describe("premium upgrade prompt: hide when Premium", () => {
  it("hides for premium, comped, and past_due via the shared isPremium helper", () => {
    for (const tier of ["premium", "comped", "past_due"] as const) {
      assert.equal(isPremium(tier), true);
      assert.equal(shouldHidePremiumUpgradeForEntitlement(tier), true);
      assert.equal(
        shouldShowPremiumUpgradePrompt({
          isPremium: isPremium(tier),
          state: EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
          pathname: "/",
        }),
        false,
      );
    }
  });

  it("hides when the layout boolean is true even on a first visit", () => {
    assert.equal(shouldHidePremiumUpgradeForEntitlement(true), true);
    assert.equal(
      shouldShowPremiumUpgradePrompt({
        isPremium: true,
        state: EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
        pathname: "/",
      }),
      false,
    );
  });

  it("stays hidden forever after Premium was observed", () => {
    const locked = applyPremiumEntitlementToPromptState(
      waiting(8),
      true,
    );
    assert.equal(locked.premiumLocked, true);
    assert.equal(locked.views, 0);
    assert.equal(
      shouldShowPremiumUpgradePrompt({
        isPremium: false,
        state: locked,
        pathname: "/",
      }),
      false,
    );
  });

  it("does not lock Free / cancelled / missing entitlements", () => {
    assert.equal(shouldHidePremiumUpgradeForEntitlement(false), false);
    assert.equal(shouldHidePremiumUpgradeForEntitlement("free"), false);
    assert.equal(shouldHidePremiumUpgradeForEntitlement("cancelled"), false);
    assert.equal(shouldHidePremiumUpgradeForEntitlement(null), false);
    assert.equal(
      applyPremiumEntitlementToPromptState(waiting(3), false).premiumLocked,
      false,
    );
  });
});

describe("premium upgrade prompt: counter + resurface", () => {
  it("shows on the first visit before any dismiss", () => {
    assert.equal(
      shouldShowPremiumUpgradePrompt({
        isPremium: false,
        state: EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
        pathname: "/",
      }),
      true,
    );
  });

  it("does not count views until after dismiss", () => {
    const first = recordPremiumUpgradeNavigation(
      EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
      "/",
      "/rewards",
    );
    assert.equal(first.views, 0);
    assert.equal(first.dismissed, false);
  });

  it("hides after Not now until 8 client navigations", () => {
    const dismissed = dismissPremiumUpgradePrompt(
      EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
    );
    assert.equal(dismissed.dismissed, true);
    assert.equal(dismissed.views, 0);
    assert.equal(
      shouldShowPremiumUpgradePrompt({
        isPremium: false,
        state: dismissed,
        pathname: "/",
      }),
      false,
    );

    let state = dismissed;
    const path = ["/", "/community", "/rewards", "/artists", "/me"];
    for (let i = 0; i < PAGE_VIEWS_TO_RESURFACE; i += 1) {
      const from = path[i % path.length];
      const to = path[(i + 1) % path.length];
      state = recordPremiumUpgradeNavigation(state, from, to);
      const show = shouldShowPremiumUpgradePrompt({
        isPremium: false,
        state,
        pathname: to,
      });
      if (i < PAGE_VIEWS_TO_RESURFACE - 1) {
        assert.equal(state.views, i + 1);
        assert.equal(show, false);
      } else {
        assert.equal(state.views, PAGE_VIEWS_TO_RESURFACE);
        assert.equal(show, true);
      }
    }
  });

  it("does not increment on first paint or same-path updates", () => {
    const dismissed = waiting(0);
    assert.equal(
      recordPremiumUpgradeNavigation(dismissed, null, "/").views,
      0,
    );
    assert.equal(
      recordPremiumUpgradeNavigation(dismissed, "/rewards", "/rewards").views,
      0,
    );
  });

  it("resets the counter on a later dismiss", () => {
    const next = dismissPremiumUpgradePrompt(waiting(8));
    assert.equal(next.views, 0);
    assert.equal(next.dismissed, true);
    assert.equal(
      shouldShowPremiumUpgradePrompt({
        isPremium: false,
        state: next,
        pathname: "/",
      }),
      false,
    );
  });

  it("does not increment after Premium lock", () => {
    const locked = applyPremiumEntitlementToPromptState(waiting(4), true);
    assert.equal(
      incrementPremiumUpgradePromptViews(locked).views,
      0,
    );
  });
});

describe("premium upgrade prompt: delay + namespaced storage", () => {
  it("picks a first-show delay between 3 and 5 seconds", () => {
    assert.equal(pickFirstShowDelayMs(() => 0), FIRST_SHOW_DELAY_MS_MIN);
    assert.equal(pickFirstShowDelayMs(() => 0.999), FIRST_SHOW_DELAY_MS_MAX);
    for (let i = 0; i < 20; i += 1) {
      const delay = pickFirstShowDelayMs();
      assert.ok(delay >= FIRST_SHOW_DELAY_MS_MIN);
      assert.ok(delay <= FIRST_SHOW_DELAY_MS_MAX);
    }
  });

  it("persists dismiss + views under a namespaced key", () => {
    assert.equal(
      PREMIUM_UPGRADE_PROMPT_STORAGE_KEY,
      "fanengage_premium_upgrade_prompt",
    );
    const storage = memoryStorage();
    const dismissed = dismissPremiumUpgradePrompt(
      EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
    );
    const withViews = incrementPremiumUpgradePromptViews(
      incrementPremiumUpgradePromptViews(dismissed),
    );
    savePremiumUpgradePromptState(storage, withViews);
    assert.equal(
      storage.store[PREMIUM_UPGRADE_PROMPT_STORAGE_KEY] != null,
      true,
    );
    const loaded = loadPremiumUpgradePromptState(storage);
    assert.deepEqual(loaded, { dismissed: true, views: 2, premiumLocked: false });
  });

  it("recovers from missing or corrupt storage", () => {
    assert.deepEqual(
      parsePremiumUpgradePromptState(null),
      EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
    );
    assert.deepEqual(
      parsePremiumUpgradePromptState("not-json"),
      EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
    );
  });
});

describe("premium upgrade prompt: hide on auth-heavy routes", () => {
  it("matches the cookie-banner form-heavy prefixes", () => {
    const cookieBanner = readRepo("../components/cookie-banner.tsx");
    for (const prefix of COOKIE_BANNER_HIDE_PREFIXES) {
      assert.match(cookieBanner, new RegExp(`"${prefix}"`));
      assert.ok(
        PREMIUM_UPGRADE_PROMPT_HIDE_PREFIXES.includes(prefix),
        `prompt hide list missing cookie-banner prefix ${prefix}`,
      );
      assert.equal(
        shouldShowPremiumUpgradePrompt({
          isPremium: false,
          state: EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
          pathname: `${prefix}/extra`,
        }),
        false,
      );
    }
  });

  it("also hides on /premium so it does not cover checkout", () => {
    assert.equal(
      shouldShowPremiumUpgradePrompt({
        isPremium: false,
        state: EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
        pathname: "/premium",
      }),
      false,
    );
  });

  it("still shows on fan-home style routes", () => {
    for (const pathname of ["/", "/community", "/rewards", "/artists"]) {
      assert.equal(
        shouldShowPremiumUpgradePrompt({
          isPremium: false,
          state: EMPTY_PREMIUM_UPGRADE_PROMPT_STATE,
          pathname,
        }),
        true,
      );
    }
  });
});

describe("premium upgrade prompt: wiring", () => {
  it("mounts a client popup from the root layout with isPremium", () => {
    const layout = readRepo("../app/layout.tsx");
    const component = readRepo("../components/premium-upgrade-prompt.tsx");
    assert.match(layout, /PremiumUpgradePrompt/);
    assert.match(layout, /isPremium=\{isPremium\}/);
    assert.match(component, /"use client"/);
    assert.match(component, /usePathname/);
    assert.match(component, /PremiumCta/);
    assert.match(component, /PREMIUM_UPGRADE_PROMPT_COPY/);
    assert.match(component, /role="dialog"/);
    assert.match(component, /aria-modal="true"/);
    assert.match(component, /Escape/);
    assert.match(component, /pickFirstShowDelayMs/);
    assert.match(component, /localStorage/);
  });

  it("keeps locked Premium CTA copy and site voice", () => {
    const cta = readRepo("./entitlements-core.ts");
    assert.match(cta, /upgrade: "Upgrade to Premium"/);
    assert.equal(
      PREMIUM_UPGRADE_PROMPT_COPY.headline,
      "Go Premium. Unlock the good stuff ✨",
    );
    assert.match(PREMIUM_UPGRADE_PROMPT_COPY.body, /community|rewards|merch/i);
    assert.equal(PREMIUM_UPGRADE_PROMPT_COPY.dismiss, "Not now");
  });
});
