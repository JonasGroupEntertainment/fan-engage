import { shouldShowPublicLeaderboard } from "@/lib/points/economy";
import type { ArtistMonthlyLeaderboard } from "./types";

export function isPublicLeaderboardHonest(
  board: Pick<ArtistMonthlyLeaderboard, "totalFans" | "top"> | null | undefined,
): boolean {
  if (!board || board.top.length === 0) return false;
  return shouldShowPublicLeaderboard({
    totalFans: board.totalFans,
    topScore: board.top[0]?.score ?? 0,
  });
}
