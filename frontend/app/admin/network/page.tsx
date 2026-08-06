import {
  getNetworkEventSummary,
  getPublisherStatuses,
  getRecentFanEvents,
  getTopSuperfans,
} from "@/lib/network/queries";
import { LiveFeed } from "./live-feed";

export const dynamic = "force-dynamic";

function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function AdminNetworkPage() {
  const [summary, initialEvents, superfans, publishers] = await Promise.all([
    getNetworkEventSummary(14),
    getRecentFanEvents(50),
    getTopSuperfans(50),
    getPublisherStatuses(),
  ]);

  // Pivot the summary: day → app → event count.
  const apps = [...new Set(summary.map((r) => r.source_app))].sort();
  const byDay = new Map<string, Map<string, number>>();
  for (const r of summary) {
    const day = byDay.get(r.day) ?? new Map<string, number>();
    day.set(r.source_app, (day.get(r.source_app) ?? 0) + r.events);
    byDay.set(r.day, day);
  }
  const days = [...byDay.keys()].sort().reverse();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>
          Jonas Network
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Cross-app fan events flowing into the hub. Feeders publish via
          network_ingest_event; this page is read-only.
        </p>
      </div>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/50">
          Publishers
        </p>
        <div className="flex flex-wrap gap-2">
          {publishers.map((p) => (
            <span
              key={p.app_name}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                p.enabled
                  ? "border-white/15 bg-black/40 text-white"
                  : "border-red-500/30 bg-red-500/10 text-red-300"
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-2 w-2 rounded-full ${
                  p.enabled ? "bg-emerald-400" : "bg-red-400"
                }`}
              />
              {p.app_name}
            </span>
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/50">
          Events per day · last 14 days
        </p>
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
          {days.length === 0 ? (
            <p className="px-4 py-6 text-sm text-white/50">No events yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  <th className="px-4 py-2 font-medium">Day</th>
                  {apps.map((a) => (
                    <th key={a} className="px-4 py-2 font-mono font-medium">
                      {a}
                    </th>
                  ))}
                  <th className="px-4 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {days.map((d) => {
                  const row = byDay.get(d)!;
                  const total = [...row.values()].reduce((a, b) => a + b, 0);
                  return (
                    <tr key={d}>
                      <td className="px-4 py-2 text-white/70">{formatDay(d)}</td>
                      {apps.map((a) => (
                        <td key={a} className="px-4 py-2">
                          {row.get(a) ?? <span className="text-white/25">—</span>}
                        </td>
                      ))}
                      <td className="px-4 py-2 font-semibold">{total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/50">
          Live events
        </p>
        <LiveFeed initialEvents={initialEvents} />
      </section>

      <section>
        <p className="mb-2 text-xs uppercase tracking-wide text-white/50">
          Top superfans · network score
        </p>
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30">
          {superfans.length === 0 ? (
            <p className="px-4 py-6 text-sm text-white/50">No scores yet.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-white/50">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Fan</th>
                  <th className="px-4 py-2 font-medium">Artist</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Events</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {superfans.map((s, i) => (
                  <tr key={`${s.network_id}-${s.artist_slug ?? ""}`}>
                    <td className="px-4 py-2 text-white/50">{i + 1}</td>
                    <td className="px-4 py-2">
                      {s.fan_name ?? s.fan_email ?? (
                        <span className="font-mono text-white/50">
                          {s.network_id.slice(0, 8)}…
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-white/60">
                      {s.artist_slug ?? <span className="text-white/25">—</span>}
                    </td>
                    <td className="px-4 py-2 font-semibold">{s.score}</td>
                    <td className="px-4 py-2 text-white/60">{s.event_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
