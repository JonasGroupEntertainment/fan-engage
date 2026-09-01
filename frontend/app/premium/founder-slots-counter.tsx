"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  initialFilled: number;
  total: number;
}

interface SlotData {
  filled: number;
  total: number;
  remaining: number;
}

export function FounderSlotsCounter({ initialFilled, total }: Props) {
  const [data, setData] = useState<SlotData>({
    filled: initialFilled,
    total,
    remaining: Math.max(0, total - initialFilled),
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchSlots = async () => {
      try {
        const res = await fetch("/api/founder-slots", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as SlotData;
        setData(json);
      } catch {
        // silently ignore — stale data is fine
      }
    };

    intervalRef.current = setInterval(fetchSlots, 30_000);
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, []);

  const { filled, total: cap, remaining } = data;
  const pct = cap > 0 ? Math.min(100, Math.round((filled / cap) * 100)) : 0;
  const isFull = remaining === 0;

  if (isFull) return null;

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
      {/* Progress bar */}
      <div className="flex items-center justify-between text-xs text-white/60 mb-2">
        <span>Free Founding Fan badges</span>
        <span>
          {filled} / {cap} claimed
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-aurora to-ember transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Remaining count */}
      <p className="mt-3 text-sm text-white/80">
        <span className="font-semibold text-white">{remaining}</span>{" "}
        {remaining === 1 ? "free badge" : "free badges"} left — first 100 joins,
        not a paid plan.
      </p>

      {/* Urgency badge — remaining <= 5 */}
      {remaining <= 5 && remaining > 1 && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-300">
          🔥 Almost full — only {remaining} spots left
        </span>
      )}

      {/* Last spot — pulsing */}
      {remaining === 1 && (
        <span className="mt-2 inline-flex animate-pulse items-center gap-1 rounded-full border border-red-400/50 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300">
          ⚡ Last spot — grab it before it&apos;s gone
        </span>
      )}
    </div>
  );
}
