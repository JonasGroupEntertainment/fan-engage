import Image from "next/image";
import type { LeaderboardEntry } from "@/lib/leaderboard/types";

/**
 * Top-3 podium for the leaderboard page. Renders 2nd–1st–3rd in a
 * stadium arrangement (silver – gold – bronze) so the eye lands on
 * #1. Auto-falls-back gracefully when fewer than 3 entries exist.
 */

interface PodiumProps {
  entries: LeaderboardEntry[]; // expected: ordered by rank ascending, length 0–3
  /** Highlight the viewer's entry with a subtle ring. */
  viewerFanId?: string | null;
}

const TIER_COLOR: Record<string, string> = {
  bronze:   "from-amber-700/40 to-amber-900/30",
  silver:   "from-slate-300/30 to-slate-500/20",
  gold:     "from-yellow-400/40 to-amber-600/30",
  platinum: "from-violet-300/40 to-fuchsia-500/30",
  founder:  "from-rose-300/40 to-rose-600/30",
};

const RANK_THEME: Record<number, { ring: string; halo: string; medal: string; height: string; label: string }> = {
  1: {
    ring:   "ring-amber-300/70",
    halo:   "from-amber-300/50 via-amber-200/30 to-yellow-400/40",
    medal:  "🥇",
    height: "h-44",
    label:  "1st",
  },
  2: {
    ring:   "ring-slate-300/60",
    halo:   "from-slate-200/40 via-slate-100/20 to-slate-300/30",
    medal:  "🥈",
    height: "h-36",
    label:  "2nd",
  },
  3: {
    ring:   "ring-amber-700/60",
    halo:   "from-amber-700/40 via-amber-800/20 to-amber-900/30",
    medal:  "🥉",
    height: "h-32",
    label:  "3rd",
  },
};

export default function LeaderboardPodium({
  entries,
  viewerFanId,
}: PodiumProps) {
  // Display order on the podium: 2nd, 1st, 3rd
  const byRank: Record<number, LeaderboardEntry | undefined> = {
    1: entries.find((e) => e.rank === 1),
    2: entries.find((e) => e.rank === 2),
    3: entries.find((e) => e.rank === 3),
  };

  const slots: Array<{ rank: 1 | 2 | 3; entry: LeaderboardEntry | undefined }> = [
    { rank: 2, entry: byRank[2] },
    { rank: 1, entry: byRank[1] },
    { rank: 3, entry: byRank[3] },
  ];

  return (
    <div className="grid grid-cols-3 items-end gap-3 sm:gap-4">
      {slots.map(({ rank, entry }) => {
        const theme = RANK_THEME[rank];
        const isViewer = entry && viewerFanId === entry.fan_id;

        return (
          <div
            key={rank}
            className={`relative flex flex-col items-center justify-end ${theme.height}`}
          >
            {/* halo glow behind the avatar */}
            <div
              aria-hidden
              className={`pointer-events-none absolute -top-6 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-gradient-to-br ${theme.halo} opacity-70 blur-2xl`}
            />

            {entry ? (
              <>
                {entry.avatar_url ? (
                  <div
                    className={`relative mb-2 h-16 w-16 overflow-hidden rounded-full ring-2 ${theme.ring} ${
                      isViewer ? "ring-offset-2 ring-offset-black/0" : ""
                    }`}
                  >
                    <Image
                      src={entry.avatar_url}
                      alt={entry.display_name}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div
                    className={`mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br ${
                      TIER_COLOR[entry.current_tier ?? "bronze"] ?? TIER_COLOR.bronze
                    } text-lg font-semibold text-white ring-2 ${theme.ring}`}
                  >
                    {entry.display_name.charAt(0).toUpperCase()}
                  </div>
                )}

                <p className="text-center text-xs font-semibold leading-tight text-white">
                  {entry.display_name}
                  {isViewer && (
                    <span className="ml-1 rounded-full bg-aurora/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-aurora">
                      You
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs uppercase tracking-wide text-white/55">
                  {entry.score.toLocaleString()} pts
                </p>
              </>
            ) : (
              <>
                <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/15 text-2xl text-white/30">
                  ?
                </div>
                <p className="text-center text-xs text-white/50">Open</p>
              </>
            )}

            {/* the podium block */}
            <div
              className={`relative mt-2 flex w-full flex-col items-center justify-center rounded-t-xl bg-gradient-to-b ${
                rank === 1
                  ? "from-amber-500/20 to-amber-700/30"
                  : rank === 2
                    ? "from-slate-300/15 to-slate-500/25"
                    : "from-amber-700/20 to-amber-900/30"
              } px-2 py-3 ring-1 ring-white/10`}
              style={{
                height:
                  rank === 1
                    ? "76px"
                    : rank === 2
                      ? "60px"
                      : "48px",
              }}
            >
              <p className="text-2xl">{theme.medal}</p>
              <p className="mt-0.5 text-xs font-bold uppercase tracking-widest text-white/75">
                {theme.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
