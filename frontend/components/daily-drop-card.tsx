import type { DailyDropState, DropRarity } from "@/lib/drops/daily-drop";

/**
 * Daily-drop reveal on the artist page. Server-rendered — the claim
 * already happened during the page's data fetch, so this just presents
 * the result: a fresh reveal ("you just got +X"), or the already-claimed
 * state nudging the fan to come back tomorrow.
 */

const RARITY_STYLES: Record<
  DropRarity,
  { label: string; emoji: string; text: string; ring: string }
> = {
  common: { label: "Common", emoji: "🎁", text: "text-white/80", ring: "ring-white/15" },
  rare: { label: "Rare", emoji: "💎", text: "text-cyan-200", ring: "ring-cyan-300/30" },
  epic: { label: "Epic", emoji: "🔮", text: "text-purple-200", ring: "ring-purple-300/40" },
  legendary: { label: "Legendary", emoji: "🌟", text: "text-amber-200", ring: "ring-amber-300/50" },
};

export default function DailyDropCard({ drop }: { drop: DailyDropState }) {
  if (drop.points === 0) return null;
  const style = RARITY_STYLES[drop.rarity];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-white/10 via-white/5 to-white/0 p-5 ring-1 ${style.ring}`}
    >
      <p className="text-xs uppercase tracking-[0.25em] text-white/55">
        Today&apos;s drop
      </p>
      <div className="mt-2 flex items-center gap-3">
        <span className="text-3xl" aria-hidden>
          {style.emoji}
        </span>
        <div>
          <p className="text-2xl font-semibold leading-none text-white">
            +{drop.points} pts
          </p>
          <p className={`mt-1 text-xs font-semibold ${style.text}`}>
            {style.label}
          </p>
        </div>
      </div>
      <p className="mt-3 border-t border-white/10 pt-3 text-xs text-white/60">
        {drop.claimedToday
          ? "Claimed just now — a new drop lands tomorrow."
          : "Already claimed today. Come back tomorrow for a new one."}
      </p>
    </div>
  );
}
