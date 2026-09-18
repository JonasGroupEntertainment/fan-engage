/**
 * Pure types and aggregation for the Super Fan Radar bridge. No I/O and no
 * path-alias imports, so the Node test runner can load it directly.
 */

export type SuperFanTier = "NONE" | "CANDIDATE" | "CORE" | "ELITE";

export interface SuperFanRow {
  username: string;
  platform: string;
  super_fan_tier: string | null;
  super_fan_index: number | null;
  outreach_opt_in: boolean | null;
}

export interface TopSuperFan {
  username: string;
  platform: string;
  tier: SuperFanTier;
  index: number;
  outreachOptIn: boolean;
}

export interface SuperFanCounts {
  eliteCount: number;
  coreCount: number;
  candidateCount: number;
  inviteReadyCount: number;
  topFans: TopSuperFan[];
}

export type SuperFanRadarSummary =
  | { connected: false }
  | ({
      connected: true;
      tenantId: string;
      tenantDisplayName: string;
    } & SuperFanCounts);

export const TOP_FAN_LIMIT = 10;

const TIERS: ReadonlySet<string> = new Set(["NONE", "CANDIDATE", "CORE", "ELITE"]);

function normalizeTier(raw: string | null): SuperFanTier {
  return raw && TIERS.has(raw) ? (raw as SuperFanTier) : "NONE";
}

/**
 * Pure aggregation over the rows Super Fan Radar returns for one tenant.
 * Kept free of I/O so it can be unit tested.
 */
export function summarizeSuperFans(rows: readonly SuperFanRow[]): SuperFanCounts {
  const counts = rows.reduce(
    (acc, row) => {
      const tier = normalizeTier(row.super_fan_tier);
      return {
        eliteCount: acc.eliteCount + (tier === "ELITE" ? 1 : 0),
        coreCount: acc.coreCount + (tier === "CORE" ? 1 : 0),
        candidateCount: acc.candidateCount + (tier === "CANDIDATE" ? 1 : 0),
        inviteReadyCount: acc.inviteReadyCount + (row.outreach_opt_in ? 1 : 0),
      };
    },
    { eliteCount: 0, coreCount: 0, candidateCount: 0, inviteReadyCount: 0 },
  );

  const topFans: TopSuperFan[] = [...rows]
    .sort((a, b) => (b.super_fan_index ?? 0) - (a.super_fan_index ?? 0))
    .slice(0, TOP_FAN_LIMIT)
    .map((row) => ({
      username: row.username,
      platform: row.platform,
      tier: normalizeTier(row.super_fan_tier),
      index: row.super_fan_index ?? 0,
      outreachOptIn: row.outreach_opt_in === true,
    }));

  return { ...counts, topFans };
}
