"use client";

import { useEffect, useRef, useState } from "react";
import type { FanEvent } from "@/lib/network/types";
import { fetchNewFanEvents } from "./actions";

const POLL_MS = 5000;
const MAX_ROWS = 100;

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const sourceColors: Record<string, string> = {
  fan_engage_internal: "text-aurora",
  raelynn_site: "text-pink-300",
  papa_jonas_site: "text-amber-300",
  brand_engage: "text-sky-300",
  that_ads_up: "text-lime-300",
};

export function LiveFeed({ initialEvents }: { initialEvents: FanEvent[] }) {
  const [events, setEvents] = useState<FanEvent[]>(initialEvents);
  const [lastPolled, setLastPolled] = useState<Date | null>(null);
  const topId = useRef(initialEvents[0]?.id ?? 0);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const fresh = await fetchNewFanEvents(topId.current);
        if (cancelled) return;
        if (fresh.length > 0) {
          topId.current = fresh[0].id;
          setEvents((prev) => [...fresh, ...prev].slice(0, MAX_ROWS));
        }
        setLastPolled(new Date());
      } catch {
        // Network hiccup — keep the current list, try again next tick.
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <p className="text-sm font-semibold">Live feed</p>
        <p className="text-xs text-white/40">
          {lastPolled
            ? `updated ${timeAgo(lastPolled.toISOString())}`
            : `refreshes every ${POLL_MS / 1000}s`}
        </p>
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-6 text-sm text-white/50">No events yet.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-white/5 overflow-y-auto">
          {events.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3 px-4 py-2 text-xs">
              <span className="shrink-0 text-white/40">{timeAgo(e.occurred_at)}</span>
              <span
                className={`shrink-0 font-mono ${sourceColors[e.source_app] ?? "text-white/70"}`}
              >
                {e.source_app}
              </span>
              <span className="font-semibold text-white">{e.event_type}</span>
              {e.artist_slug && <span className="text-white/60">{e.artist_slug}</span>}
              {e.entity_type && (
                <span className="truncate text-white/40">
                  {e.entity_type}
                  {e.entity_id ? ` · ${e.entity_id}` : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
