import { createAdminClient } from "@/lib/supabase/admin";
import { awardPoints } from "@/lib/points/award";

/**
 * Daily drop — a variable-reward bonus revealed once per calendar day (UTC)
 * when a signed-in fan visits an artist page.
 *
 * The amount is deterministic per (fan, day): a hash of `fanId:date` picks
 * from a weighted table, so reloading the page can never re-roll a better
 * prize, and the claim is idempotent via the points_ledger source_ref
 * `daily-drop:<fanId>:<date>` — same pattern as the signup bonus.
 *
 * Weighted table:
 *   60%  +10  Common
 *   25%  +25  Rare
 *   10%  +50  Epic
 *    5% +100  Legendary
 */

export type DropRarity = "common" | "rare" | "epic" | "legendary";

export interface DailyDropState {
  points: number;
  rarity: DropRarity;
  claimedToday: boolean; // true if THIS call performed the claim
  alreadyClaimed: boolean; // true if a prior visit today already claimed it
}

const TABLE: Array<{ upTo: number; points: number; rarity: DropRarity }> = [
  { upTo: 60, points: 10, rarity: "common" },
  { upTo: 85, points: 25, rarity: "rare" },
  { upTo: 95, points: 50, rarity: "epic" },
  { upTo: 100, points: 100, rarity: "legendary" },
];

/** Small stable string hash (FNV-1a) → 0-99 bucket. */
function bucketFor(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 100;
}

export function rollDailyDrop(fanId: string, dateStr: string): {
  points: number;
  rarity: DropRarity;
} {
  const bucket = bucketFor(`${fanId}:${dateStr}`);
  const row = TABLE.find((r) => bucket < r.upTo) ?? TABLE[0];
  return { points: row.points, rarity: row.rarity };
}

/**
 * Claim today's drop for a fan. Idempotent within the same UTC day.
 * Non-essential: any failure returns a benign zero-state rather than
 * blocking the page render.
 */
export async function claimDailyDrop(
  fanId: string,
  communityId?: string,
): Promise<DailyDropState> {
  const benign: DailyDropState = {
    points: 0,
    rarity: "common",
    claimedToday: false,
    alreadyClaimed: false,
  };
  if (!fanId) return benign;

  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const { points, rarity } = rollDailyDrop(fanId, todayStr);
    const sourceRef = `daily-drop:${fanId}:${todayStr}`;

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("points_ledger")
      .select("id")
      .eq("source", "daily_drop")
      .eq("source_ref", sourceRef)
      .maybeSingle();

    if (existing) {
      return { points, rarity, claimedToday: false, alreadyClaimed: true };
    }

    await awardPoints(admin, {
      fanId,
      delta: points,
      source: "daily_drop",
      sourceRef,
      note: `Daily drop (${rarity})`,
      ...(communityId ? { communityId } : {}),
    });

    return { points, rarity, claimedToday: true, alreadyClaimed: false };
  } catch (err) {
    console.warn("claimDailyDrop failed (non-blocking):", err);
    return benign;
  }
}
