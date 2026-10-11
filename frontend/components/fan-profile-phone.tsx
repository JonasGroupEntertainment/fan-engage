import { Icon } from "@/components/icon";
import { TIER_MIN_POINTS } from "@/lib/tier-thresholds";

// What a brand new fan sees after signup: the 100-point welcome bonus,
// sitting at Bronze on the way to Silver.
const SAMPLE_POINTS = 100;
const SILVER_POINTS = TIER_MIN_POINTS.silver;
const SAMPLE_PROGRESS_PCT = Math.round((SAMPLE_POINTS / SILVER_POINTS) * 100);

const SAMPLE_REWARDS = [
  { icon: "trophy", label: "Phone Wallpaper", pts: "250 pts" },
  { icon: "ticket", label: "Lyric Wallpaper", pts: "500 pts" },
  { icon: "handshake", label: "Fan Spotlight", pts: "1,000 pts" },
] as const;

/**
 * Phone mockup of the fan profile for the signed-out landing. Always
 * labeled "Sample preview" so it never reads as a real fan's account.
 */
export default function FanProfilePhone({
  foundingSpotsRemaining,
  foundingTarget,
  foundingClosed,
}: {
  foundingSpotsRemaining: number;
  foundingTarget: number;
  foundingClosed: boolean;
}) {
  return (
    <div className="relative mx-auto w-[280px] sm:w-[300px]">
      <div
        aria-hidden
        className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-aurora/30 via-transparent to-ember/30 blur-3xl"
      />
      <div className="relative rounded-[2.75rem] border border-white/15 bg-black p-2.5 shadow-glass">
        <div className="relative h-[560px] overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-aurora/40 via-slate-900 to-black">
          <video
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 mix-blend-screen"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
          >
            <source src="/videos/fan-profile-holo-loop.mp4" type="video/mp4" />
          </video>

          {/* Notch */}
          <div
            aria-hidden
            className="absolute left-1/2 top-2 h-6 w-24 -translate-x-1/2 rounded-full bg-black"
          />

          <div className="relative flex h-full flex-col px-5 pb-5 pt-12">
            <div className="flex items-center justify-between">
              <p className="text-[10px] uppercase tracking-widest text-white/60">
                Sample preview
              </p>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/80">
                Bronze
              </span>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-aurora to-ember text-xs font-bold"
              >
                You
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Your fan profile</p>
                <p className="text-xs text-white/55">Following RaeLynn</p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-black/35 p-4">
              <div className="flex items-baseline justify-between">
                <p
                  className="text-3xl font-semibold text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {SAMPLE_POINTS}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-white/50">
                  fan points
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-aurora to-ember"
                  style={{ width: `${SAMPLE_PROGRESS_PCT}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-white/50">
                {(SILVER_POINTS - SAMPLE_POINTS).toLocaleString("en-US")} pts to Silver
              </p>
            </div>

            {!foundingClosed && (
              <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="flex items-center gap-2 text-xs text-white/75">
                  <Icon name="medal" size={16} /> Founding spots left
                </span>
                <span className="text-sm font-semibold tabular-nums text-white">
                  {foundingSpotsRemaining.toLocaleString("en-US")}
                  <span className="text-white/45"> / {foundingTarget}</span>
                </span>
              </div>
            )}

            <p className="mt-5 text-[10px] uppercase tracking-widest text-white/50">
              Rewards to unlock
            </p>
            <div className="mt-2 space-y-2">
              {SAMPLE_REWARDS.map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between rounded-xl bg-black/35 px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <Icon name={r.icon} size={16} /> {r.label}
                  </span>
                  <span className="text-emerald-300">{r.pts}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
