/**
 * /admin/artists/[slug]/events/[id]/match
 *
 * Admin preview UI for the smart event-match notification flow.
 *
 *   1. If the event hasn't been scored yet, kick off matchEvent() to
 *      compute the candidate set.
 *   2. Render the ranked candidate list with score components +
 *      sent / not-sent state.
 *   3. Two server-action buttons:
 *        • Re-score   — runs matchEvent() again (e.g. after followers
 *                        change or scoring weights change).
 *        • Send all   — fires in-app + SMS notifications to candidates.
 *
 * No auto-send. Admin clicks Send.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchEvent } from "@/lib/event-matching";
import {
  rescoreEventAction,
  sendEventMatchAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string; id: string }>;
}

interface LogRow {
  fan_id: string;
  total_score: number;
  score_components: {
    geo: number;
    past_rsvp_rate: number;
    engagement: number;
    tier_weight: number;
  };
  is_candidate: boolean;
  sent_at: string | null;
  channels_sent: string[];
  fan: {
    first_name: string | null;
    email: string | null;
    city: string | null;
    current_tier: string;
    sms_opted_in: boolean;
  };
}

export default async function EventMatchPage({ params }: PageProps) {
  const { slug, id } = await params;
  const admin = createAdminClient();

  // Load the event.
  const { data: event } = await admin
    .from("artist_events")
    .select(
      "id, artist_slug, title, location, starts_at, active, match_processed_at",
    )
    .eq("id", id)
    .eq("artist_slug", slug)
    .maybeSingle();

  if (!event) notFound();

  // First visit: compute candidates.
  if (!event.match_processed_at) {
    try {
      await matchEvent(id);
    } catch (err) {
      return (
        <ErrorShell
          slug={slug}
          message={
            err instanceof Error
              ? err.message
              : "Failed to score event. Try again."
          }
        />
      );
    }
  }

  // Load the (now-populated) candidate set.
  const { data: rows } = await admin
    .from("event_match_log")
    .select(
      "fan_id, total_score, score_components, is_candidate, sent_at, channels_sent, fans!inner(first_name, email, city, current_tier, sms_opted_in)",
    )
    .eq("event_id", id)
    .order("total_score", { ascending: false });

  const log = ((rows ?? []) as unknown as Array<
    Omit<LogRow, "fan"> & { fans: LogRow["fan"] }
  >).map((r) => ({ ...r, fan: r.fans } as LogRow));

  const candidates = log.filter((r) => r.is_candidate);
  const alreadySent = candidates.filter((r) => r.sent_at).length;
  const ready = candidates.length - alreadySent;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/60">
            Event match preview
          </p>
          <h1
            className="text-2xl font-semibold text-white"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {event.title}
          </h1>
          <p className="mt-1 text-sm text-white/60">
            {event.location ?? "Location TBD"}
            {event.starts_at
              ? ` · ${new Date(event.starts_at).toLocaleString()}`
              : ""}
          </p>
        </div>
        <Link
          href={`/admin/artists/${slug}`}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:bg-white/10"
        >
          ← Back to artist
        </Link>
      </header>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-4 text-xs text-white/70">
        <p>
          Candidates: <span className="font-semibold text-white">{candidates.length}</span>
          {" · "}
          Total scored: <span className="text-white">{log.length}</span>
          {" · "}
          Already sent: <span className="text-white">{alreadySent}</span>
          {" · "}
          Ready to send: <span className="text-white">{ready}</span>
        </p>
        <p className="mt-2 text-white/50">
          Top 25% by score, gated on a 0.15 minimum-score floor. Re-score after
          follower changes or scoring-weight tweaks. Send blasts in-app
          notifications + SMS (only to fans with sms_opted_in).
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <form action={rescoreEventAction.bind(null, id, slug)}>
          <button
            type="submit"
            className="rounded-full border border-white/20 bg-black/40 px-4 py-2 text-sm text-white/90 hover:bg-white/10"
          >
            Re-score
          </button>
        </form>
        <form action={sendEventMatchAction.bind(null, id, slug)}>
          <button
            type="submit"
            disabled={ready === 0}
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-4 py-2 text-sm font-semibold text-white shadow disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send notifications ({ready})
          </button>
        </form>
      </div>

      <CandidatesTable log={log} />
    </div>
  );
}

function CandidatesTable({ log }: { log: LogRow[] }) {
  if (log.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-white/60">
        No followers scored yet — the artist may not have any followers, or
        every follower is suspended.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="min-w-full text-xs">
        <thead className="bg-white/5 text-left text-white/60">
          <tr>
            <th className="px-3 py-2">Fan</th>
            <th className="px-3 py-2">City</th>
            <th className="px-3 py-2">Tier</th>
            <th className="px-3 py-2 text-right">Geo</th>
            <th className="px-3 py-2 text-right">RSVP rate</th>
            <th className="px-3 py-2 text-right">Engagement</th>
            <th className="px-3 py-2 text-right">Tier wt.</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {log.map((r) => (
            <tr
              key={r.fan_id}
              className={r.is_candidate ? "bg-white/[0.03]" : "opacity-60"}
            >
              <td className="px-3 py-2 text-white">
                {r.fan.first_name ?? "—"}
                <div className="text-xs text-white/50">
                  {r.fan.email ?? ""}
                </div>
              </td>
              <td className="px-3 py-2 text-white/70">{r.fan.city ?? "—"}</td>
              <td className="px-3 py-2 text-white/70 capitalize">
                {r.fan.current_tier}
              </td>
              <td className="px-3 py-2 text-right text-white/80">
                {r.score_components.geo.toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right text-white/80">
                {r.score_components.past_rsvp_rate.toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right text-white/80">
                {r.score_components.engagement.toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right text-white/80">
                {r.score_components.tier_weight.toFixed(2)}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-white">
                {r.total_score.toFixed(2)}
              </td>
              <td className="px-3 py-2">
                {r.sent_at ? (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
                    sent · {r.channels_sent.join("+") || "—"}
                  </span>
                ) : r.is_candidate ? (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                    ready
                  </span>
                ) : (
                  <span className="text-xs text-white/50">below cap</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorShell({ slug, message }: { slug: string; message: string }) {
  return (
    <div className="space-y-6">
      <Link
        href={`/admin/artists/${slug}`}
        className="text-xs text-white/60 hover:underline"
      >
        ← Back to artist
      </Link>
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
        {message}
      </div>
    </div>
  );
}
