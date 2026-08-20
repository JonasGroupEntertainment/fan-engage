/**
 * Points economy helpers shared by the writer, redeem UI, and tests.
 * SQL `apply_points_award` / `redeem_reward` are the live writers.
 * This module is the contract those functions must honor.
 */

export const FOUNDING_FAN_MULTIPLIER = 1.5;
export const FOUNDING_FAN_CAP = 100;

export const DIGITAL_REDEEMABLE_TITLES = [
  "Phone Wallpaper",
  "Exclusive Phone Wallpaper Pack",
  "Lyric Wallpaper",
  "Fan Spotlight",
] as const;

export const HELD_REWARD_TITLES = ["VIP Moment Raffle"] as const;

export const HIDDEN_UNTIL_CLIP_TITLES = ["Behind-the-Song Video"] as const;

export type LedgerEntry = {
  fanId: string;
  delta: number;
  sourceRef?: string | null;
};

export function isFoundingFanNumber(n: number | null | undefined): boolean {
  return typeof n === "number" && n >= 1 && n <= FOUNDING_FAN_CAP;
}

export type FoundingFanClaimState = {
  claimed: number;
  remaining: number;
  cap: number;
  closed: boolean;
};

/** Remaining is always cap − claimed. Never an independent leftover. */
export function foundingClaimStateFromCount(
  claimed: number,
): FoundingFanClaimState {
  const safeClaimed = Number.isFinite(claimed) ? Math.max(0, claimed) : 0;
  const remaining = Math.max(0, FOUNDING_FAN_CAP - safeClaimed);
  return {
    claimed: safeClaimed,
    remaining,
    cap: FOUNDING_FAN_CAP,
    closed: remaining === 0,
  };
}

/** Same 1–100 filter as `isFoundingFanNumber` / the points writer. */
export function countFoundingFanNumbers(
  numbers: Array<number | null | undefined>,
): number {
  return numbers.filter((n) => isFoundingFanNumber(n)).length;
}

/** Writer rule: Founding Fan #1–100 gets 1.5×. Not stacked with premium. */
export function applyFoundingMultiplier(
  baseDelta: number,
  opts: { foundingFanNumber?: number | null; isPremium?: boolean },
): number {
  if (baseDelta <= 0) return baseDelta;
  const founding = isFoundingFanNumber(opts.foundingFanNumber);
  const premium = opts.isPremium === true;
  if (!founding && !premium) return baseDelta;
  return Math.round(baseDelta * FOUNDING_FAN_MULTIPLIER);
}

export function ledgerBalance(entries: LedgerEntry[], fanId: string): number {
  return entries
    .filter((e) => e.fanId === fanId)
    .reduce((sum, e) => sum + e.delta, 0);
}

export type SpendResult =
  | { ok: true; balance: number; entries: LedgerEntry[] }
  | { ok: false; reason: "insufficient" | "duplicate" | "held" | "not-redeemable"; balance: number; entries: LedgerEntry[] };

/**
 * Atomic spend against a ledger snapshot. Sequential calls with the
 * returned `entries` is how a race serializes once the fan row is locked.
 */
export function spendFromLedger(
  entries: LedgerEntry[],
  fanId: string,
  cost: number,
  sourceRef: string,
): SpendResult {
  if (entries.some((e) => e.sourceRef === sourceRef)) {
    return { ok: false, reason: "duplicate", balance: ledgerBalance(entries, fanId), entries };
  }
  const balance = ledgerBalance(entries, fanId);
  if (balance < cost) {
    return { ok: false, reason: "insufficient", balance, entries };
  }
  const next = [...entries, { fanId, delta: -cost, sourceRef }];
  return { ok: true, balance: ledgerBalance(next, fanId), entries: next };
}

/** Two concurrent spends of `cost` against the same opening balance. */
export function simulateSerializedSpendRace(opts: {
  openingBalance: number;
  cost: number;
  fanId?: string;
}): { first: SpendResult; second: SpendResult; finalBalance: number } {
  const fanId = opts.fanId ?? "fan-a";
  let entries: LedgerEntry[] = [{ fanId, delta: opts.openingBalance, sourceRef: "open" }];
  const first = spendFromLedger(entries, fanId, opts.cost, "redemption:1");
  entries = first.entries;
  const second = spendFromLedger(entries, fanId, opts.cost, "redemption:2");
  return {
    first,
    second,
    finalBalance: ledgerBalance(second.entries, fanId),
  };
}

export function isDigitallyRedeemableTitle(
  title: string,
  opts: { active?: boolean; clipUrl?: string | null } = {},
): boolean {
  const normalized = title.trim();
  if ((HELD_REWARD_TITLES as readonly string[]).includes(normalized)) {
    return false;
  }
  if ((HIDDEN_UNTIL_CLIP_TITLES as readonly string[]).includes(normalized)) {
    const clip = opts.clipUrl?.trim() ?? "";
    return clip.length > 0 && opts.active !== false;
  }
  if ((DIGITAL_REDEEMABLE_TITLES as readonly string[]).includes(normalized)) {
    return opts.active !== false;
  }
  return false;
}

/** Hide a leaderboard that would read as fake social proof. */
export const MIN_PUBLIC_LEADERBOARD_FANS = 3;
export const MIN_PUBLIC_LEADERBOARD_TOP_SCORE = 25;

export function shouldShowPublicLeaderboard(opts: {
  totalFans: number;
  topScore: number;
}): boolean {
  if (opts.totalFans < MIN_PUBLIC_LEADERBOARD_FANS) return false;
  if (opts.topScore < MIN_PUBLIC_LEADERBOARD_TOP_SCORE) return false;
  return true;
}
