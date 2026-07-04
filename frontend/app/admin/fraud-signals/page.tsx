/**
 * /admin/fraud-signals (FE)
 *
 * Lists pending fraud flags with full evidence. Admin can dismiss
 * (false positive) or confirm (suspicious — flag for follow-up).
 * No auto-action ever taken.
 */

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminUser } from "@/lib/admin";
import { dismissFraudSignalAction, confirmFraudSignalAction } from "./actions";

export const dynamic = "force-dynamic";

interface SignalRow {
  id: string;
  fan_id: string;
  verdict: string;
  confidence: number;
  triggers: string[];
  reasons: string[];
  evidence_json: unknown;
  status: string;
  scanned_at: string;
  reviewed_at: string | null;
}

interface EvidenceShape {
  fan_summary?: {
    signup_date?: string | null;
    total_points?: number | null;
    days_since_signup?: number | null;
    has_interest?: boolean;
  };
  activity_24h?: { posts?: number; comments?: number };
  post_samples?: string[];
  comment_samples?: string[];
}

export default async function FraudSignalsPage() {
  const user = await getAdminUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: pending } = await admin
    .from("fraud_signals")
    .select(
      "id, fan_id, verdict, confidence, triggers, reasons, evidence_json, status, scanned_at, reviewed_at",
    )
    .eq("status", "pending")
    .order("confidence", { ascending: false })
    .limit(20);

  const pendingRows = (pending ?? []) as SignalRow[];

  const { data: history } = await admin
    .from("fraud_signals")
    .select("id, fan_id, verdict, confidence, status, scanned_at, reviewed_at")
    .neq("status", "pending")
    .order("reviewed_at", { ascending: false })
    .limit(10);

  const historyRows = (history ?? []) as SignalRow[];

  const fanIds = Array.from(
    new Set(
      [...pendingRows, ...historyRows].map((r) => r.fan_id),
    ),
  );
  const { data: fans } = fanIds.length
    ? await admin
        .from("fans")
        .select("id, first_name, email, total_points, created_at")
        .in("id", fanIds)
    : { data: [] };
  const fansById = new Map<string, { first_name?: string; email?: string; total_points?: number; created_at?: string }>();
  for (const f of (fans ?? []) as Array<Record<string, unknown>>) {
    fansById.set(f.id as string, f as { first_name?: string; email?: string; total_points?: number; created_at?: string });
  }

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-white/60">
          Admin · Fraud signals
        </p>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          AI-flagged accounts for review
        </h1>
        <p className="max-w-2xl text-sm text-white/70">
          A daily cron scans for unusual activity (burst posting, rapid
          points gain, robotic content patterns) and Claude reviews each
          candidate. Flags appear here for your review.{" "}
          <span className="text-white/90">No automatic action is taken.</span>
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Pending review ({pendingRows.length})
        </h2>
        {pendingRows.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-white/60">
            No pending flags. The scanner is conservative by design — most
            fans are legitimate.
          </p>
        ) : (
          <ul className="space-y-3">
            {pendingRows.map((s) => (
              <PendingFlagCard
                key={s.id}
                signal={s}
                fan={fansById.get(s.fan_id)}
              />
            ))}
          </ul>
        )}
      </section>

      {historyRows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white/80">
            Recent decisions
          </h2>
          <ul className="space-y-2">
            {historyRows.map((s) => (
              <li
                key={s.id}
                className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${
                      s.status === "dismissed"
                        ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
                        : "border-rose-300/30 bg-rose-300/10 text-rose-200"
                    }`}
                  >
                    {s.status}
                  </span>
                  <span className="text-white/40">
                    {fansById.get(s.fan_id)?.first_name ??
                      s.fan_id.slice(0, 8)}{" "}
                    · {s.verdict} · {Math.round(s.confidence * 100)}%
                  </span>
                  <span className="text-white/40">
                    {s.reviewed_at
                      ? new Date(s.reviewed_at).toLocaleString()
                      : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function PendingFlagCard({
  signal,
  fan,
}: {
  signal: SignalRow;
  fan: { first_name?: string; email?: string; total_points?: number; created_at?: string } | undefined;
}) {
  const evidence = (signal.evidence_json ?? {}) as EvidenceShape;
  return (
    <li className="glass-card p-5">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span
            className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${
              signal.verdict === "suspicious"
                ? "border-rose-300/40 bg-rose-300/10 text-rose-200"
                : "border-amber-300/40 bg-amber-300/10 text-amber-200"
            }`}
          >
            {signal.verdict} · {Math.round(signal.confidence * 100)}%
          </span>
          {signal.triggers.map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-white/60"
            >
              {t}
            </span>
          ))}
          <span className="ml-auto text-white/40">
            scanned {new Date(signal.scanned_at).toLocaleString()}
          </span>
        </div>

        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-white/50">
              Fan
            </p>
            <p className="text-white/85">
              {fan?.first_name ?? "—"} · {fan?.email ?? "—"}
            </p>
            <p className="text-white/60">
              {fan?.total_points ?? 0} pts · signed up{" "}
              {fan?.created_at
                ? new Date(fan.created_at).toLocaleDateString()
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-white/50">
              Activity (24h)
            </p>
            <p className="text-white/85">
              {evidence.activity_24h?.posts ?? 0} posts ·{" "}
              {evidence.activity_24h?.comments ?? 0} comments
            </p>
          </div>
        </div>

        {signal.reasons.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-white/50">
              Claude&apos;s reasons
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-white/80">
              {signal.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {evidence.post_samples && evidence.post_samples.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-white/60 hover:text-white">
              Post samples ({evidence.post_samples.length})
            </summary>
            <ul className="mt-2 space-y-1 pl-3 text-white/70">
              {evidence.post_samples.map((b, i) => (
                <li key={i} className="border-l border-white/10 pl-2">
                  {b}
                </li>
              ))}
            </ul>
          </details>
        )}

        {evidence.comment_samples && evidence.comment_samples.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-white/60 hover:text-white">
              Comment samples ({evidence.comment_samples.length})
            </summary>
            <ul className="mt-2 space-y-1 pl-3 text-white/70">
              {evidence.comment_samples.map((b, i) => (
                <li key={i} className="border-l border-white/10 pl-2">
                  {b}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <form action={dismissFraudSignalAction}>
            <input type="hidden" name="signal_id" value={signal.id} />
            <button
              type="submit"
              className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-1.5 text-xs text-emerald-200 hover:bg-emerald-300/20"
            >
              ✓ Dismiss (looks legitimate)
            </button>
          </form>
          <form action={confirmFraudSignalAction}>
            <input type="hidden" name="signal_id" value={signal.id} />
            <button
              type="submit"
              className="rounded-full border border-rose-300/30 bg-rose-300/10 px-4 py-1.5 text-xs text-rose-200 hover:bg-rose-300/20"
            >
              ⚠ Confirm (needs follow-up)
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
