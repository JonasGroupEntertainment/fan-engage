/**
 * /admin/briefs
 *
 * Recent daily admin briefs (Phase 15). Server component — admin
 * layout already enforces the auth gate. Lists the last 14 briefs,
 * with the most recent expanded by default.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminBriefMetrics } from "@/lib/admin-brief";

export const dynamic = "force-dynamic";

interface BriefRow {
  id: string;
  window_end: string;
  metrics: AdminBriefMetrics;
  summary: string;
  channels_sent: string[];
  model: string;
  generated_ms: number | null;
  created_at: string;
}

export default async function AdminBriefsPage() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_briefs")
    .select(
      "id, window_end, metrics, summary, channels_sent, model, generated_ms, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(14);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
        Failed to load briefs: {error.message}
      </div>
    );
  }

  const briefs = (data ?? []) as unknown as BriefRow[];

  if (briefs.length === 0) {
    return (
      <div className="space-y-3">
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Daily admin briefs
        </h1>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-white/70">
          No briefs yet. The daily cron fires at 13:00 UTC each day —
          first run lands tomorrow morning. To trigger one immediately,
          hit{" "}
          <code className="rounded bg-black/60 px-1.5 py-0.5">
            /api/cron/daily-admin-brief
          </code>{" "}
          with the configured CRON_SECRET.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Daily admin briefs
        </h1>
        <p className="text-xs text-white/60">
          Latest {briefs.length} briefs. Generated daily at 13:00 UTC.
        </p>
      </header>

      <div className="space-y-4">
        {briefs.map((b, i) => (
          <BriefCard key={b.id} brief={b} defaultOpen={i === 0} />
        ))}
      </div>
    </div>
  );
}

function BriefCard({ brief, defaultOpen }: { brief: BriefRow; defaultOpen: boolean }) {
  const created = new Date(brief.created_at).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <details
      open={defaultOpen}
      className="rounded-2xl border border-white/10 bg-black/30"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-4 text-sm">
        <div>
          <p className="font-semibold text-white">{created}</p>
          <p className="text-xs text-white/50">
            {brief.metrics.platform.posts} posts ·{" "}
            {brief.metrics.platform.reactions} reactions ·{" "}
            {brief.metrics.platform.signups} signups
            {brief.channels_sent.length > 0 && (
              <span className="ml-2 text-emerald-300/80">
                · sent: {brief.channels_sent.join(", ")}
              </span>
            )}
          </p>
        </div>
        <span className="text-xs uppercase tracking-wide text-white/50">
          {brief.model.replace("claude-", "")}
        </span>
      </summary>

      <div className="space-y-4 border-t border-white/10 px-5 py-4">
        <pre className="whitespace-pre-wrap text-xs leading-relaxed text-white/90">
          {brief.summary}
        </pre>

        <details className="rounded-xl border border-white/10 bg-black/40">
          <summary className="cursor-pointer px-3 py-2 text-xs uppercase tracking-wide text-white/50">
            Raw metrics (jsonb)
          </summary>
          <pre className="overflow-x-auto px-3 py-2 text-xs leading-relaxed text-white/70">
            {JSON.stringify(brief.metrics, null, 2)}
          </pre>
        </details>

        {brief.metrics.anomalies.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-white/50">
              Anomalies (rule-based)
            </p>
            <ul className="space-y-1">
              {brief.metrics.anomalies.map((a, i) => (
                <li
                  key={i}
                  className={`rounded-md px-2 py-1 text-xs ${
                    a.severity === "warn"
                      ? "bg-amber-500/15 text-amber-200"
                      : "bg-white/10 text-white/80"
                  }`}
                >
                  [{a.kind}] {a.detail}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
