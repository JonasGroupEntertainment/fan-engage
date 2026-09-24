/**
 * Premium upgrade popup timing + persistence.
 *
 * First visit waits 3–5s, then can show. "Not now" dismisses and
 * resurfaces after 8 App Router page views (navigations, not clicks).
 * Premium / comped / past_due never see it; once Premium, it stays gone.
 */

import { isPremium, type SubscriptionTier } from "./entitlements-core.ts";

export const PREMIUM_UPGRADE_PROMPT_STORAGE_KEY =
  "fanengage_premium_upgrade_prompt";

export const PAGE_VIEWS_TO_RESURFACE = 8;

export const FIRST_SHOW_DELAY_MS_MIN = 3000;
export const FIRST_SHOW_DELAY_MS_MAX = 5000;

/**
 * Same form-heavy prefixes as the cookie banner, plus /premium so the
 * prompt never covers checkout or auth CTAs.
 */
export const PREMIUM_UPGRADE_PROMPT_HIDE_PREFIXES = [
  "/for-artists/apply",
  "/signup",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/auth",
  "/premium",
] as const;

export const COOKIE_BANNER_HIDE_PREFIXES = [
  "/for-artists/apply",
  "/signup",
  "/login",
  "/forgot-password",
  "/reset-password",
  "/onboarding",
  "/auth",
] as const;

export const PREMIUM_UPGRADE_PROMPT_COPY = {
  headline: "Go Premium. Unlock the good stuff ✨",
  body: "Post in the community, redeem rewards, and more. Merch drops coming soon.",
  dismiss: "Not now",
} as const;

export type PremiumUpgradePromptState = {
  /** True after the fan has dismissed at least once (start counting views). */
  dismissed: boolean;
  /** Client navigations since the last dismiss. */
  views: number;
  /** Sticky hide after we observed Premium (premium/comped/past_due). */
  premiumLocked: boolean;
};

export const EMPTY_PREMIUM_UPGRADE_PROMPT_STATE: PremiumUpgradePromptState = {
  dismissed: false,
  views: 0,
  premiumLocked: false,
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function parsePremiumUpgradePromptState(
  raw: string | null | undefined,
): PremiumUpgradePromptState {
  if (!raw) return { ...EMPTY_PREMIUM_UPGRADE_PROMPT_STATE };
  try {
    const parsed = JSON.parse(raw) as Partial<PremiumUpgradePromptState>;
    const views = Number(parsed.views);
    return {
      dismissed: parsed.dismissed === true,
      views: Number.isFinite(views) ? Math.max(0, Math.floor(views)) : 0,
      premiumLocked: parsed.premiumLocked === true,
    };
  } catch {
    return { ...EMPTY_PREMIUM_UPGRADE_PROMPT_STATE };
  }
}

export function serializePremiumUpgradePromptState(
  state: PremiumUpgradePromptState,
): string {
  return JSON.stringify({
    dismissed: state.dismissed,
    views: state.views,
    premiumLocked: state.premiumLocked,
  });
}

export function loadPremiumUpgradePromptState(
  storage: StorageLike,
): PremiumUpgradePromptState {
  try {
    return parsePremiumUpgradePromptState(
      storage.getItem(PREMIUM_UPGRADE_PROMPT_STORAGE_KEY),
    );
  } catch {
    return { ...EMPTY_PREMIUM_UPGRADE_PROMPT_STATE };
  }
}

export function savePremiumUpgradePromptState(
  storage: StorageLike,
  state: PremiumUpgradePromptState,
): void {
  try {
    storage.setItem(
      PREMIUM_UPGRADE_PROMPT_STORAGE_KEY,
      serializePremiumUpgradePromptState(state),
    );
  } catch {
    /* private mode / quota — prompt may reappear next visit */
  }
}

export function isPremiumUpgradePromptHiddenPath(pathname: string): boolean {
  return PREMIUM_UPGRADE_PROMPT_HIDE_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );
}

/**
 * Cookie banner is visible when no consent value is stored and the route
 * does not suppress the banner. Any stored value counts as resolved —
 * the banner hides as soon as localStorage is non-null.
 */
export function isCookieBannerOpen(opts: {
  consentRaw: string | null | undefined;
  pathname: string;
}): boolean {
  if (opts.consentRaw != null) return false;
  return !COOKIE_BANNER_HIDE_PREFIXES.some((prefix) =>
    opts.pathname.startsWith(prefix),
  );
}

/**
 * True when the viewer has Premium-level access. Accepts the shared
 * isPremium signals (tier string, membership row, or boolean).
 */
export function shouldHidePremiumUpgradeForEntitlement(
  source:
    | boolean
    | SubscriptionTier
    | string
    | null
    | undefined
    | { isPremium?: boolean; tier?: string | null; subscription_tier?: string | null },
): boolean {
  if (typeof source === "boolean") return source;
  return isPremium(source);
}

export function shouldShowPremiumUpgradePrompt(args: {
  /** Signed-in Free members only. Guests never see the prompt. */
  signedIn: boolean;
  isPremium: boolean;
  state: PremiumUpgradePromptState;
  pathname: string;
  /** True while the cookie consent banner is still on screen. */
  cookieBannerOpen?: boolean;
}): boolean {
  if (!args.signedIn) return false;
  if (args.cookieBannerOpen) return false;
  if (
    shouldHidePremiumUpgradeForEntitlement(args.isPremium) ||
    args.state.premiumLocked
  ) {
    return false;
  }
  if (isPremiumUpgradePromptHiddenPath(args.pathname)) return false;
  if (!args.state.dismissed) return true;
  return args.state.views >= PAGE_VIEWS_TO_RESURFACE;
}

export function incrementPremiumUpgradePromptViews(
  state: PremiumUpgradePromptState,
): PremiumUpgradePromptState {
  if (state.premiumLocked || !state.dismissed) return state;
  return { ...state, views: state.views + 1 };
}

/**
 * Count App Router navigations after dismiss. First paint and same-path
 * updates (search params, re-renders) do not increment.
 */
export function recordPremiumUpgradeNavigation(
  state: PremiumUpgradePromptState,
  previousPath: string | null,
  nextPath: string,
): PremiumUpgradePromptState {
  const previous = previousPath?.trim() || null;
  const next = nextPath.trim() || "/";
  if (previous == null || previous === next) return state;
  return incrementPremiumUpgradePromptViews(state);
}

export function dismissPremiumUpgradePrompt(
  state: PremiumUpgradePromptState,
): PremiumUpgradePromptState {
  return { ...state, dismissed: true, views: 0 };
}

export function lockPremiumUpgradePrompt(): PremiumUpgradePromptState {
  return { dismissed: true, views: 0, premiumLocked: true };
}

export function applyPremiumEntitlementToPromptState(
  state: PremiumUpgradePromptState,
  isPremiumViewer: boolean,
): PremiumUpgradePromptState {
  if (!shouldHidePremiumUpgradeForEntitlement(isPremiumViewer)) return state;
  if (state.premiumLocked) return state;
  return lockPremiumUpgradePrompt();
}

export function pickFirstShowDelayMs(random = Math.random): number {
  const span = FIRST_SHOW_DELAY_MS_MAX - FIRST_SHOW_DELAY_MS_MIN;
  return FIRST_SHOW_DELAY_MS_MIN + Math.floor(random() * (span + 1));
}
