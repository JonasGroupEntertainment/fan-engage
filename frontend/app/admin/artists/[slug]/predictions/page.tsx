import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { predictionPhase } from "@/lib/predictions/types";
import ModerationButton from "@/app/admin/community/moderation-button";
import { resolveAdminPredictionAction } from "./actions";

export const dynamic = "force-dynamic";

type PollOption = {
  id: string;
  label: string;
  sort_order: number;
};

type Prediction = {
  id: string;
  body: string;
  created_at: string;
  prediction_closes_at: string | null;
  resolved_at: string | null;
  correct_option_id: string | null;
  points_for_correct: number | null;
  options: PollOption[];
};

export default async function AdminArtistPredictionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: artist } = await admin
    .from("artists")
    .select("slug, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!artist) notFound();

  // Fetch all predictions for this artist, newest first
  const { data: rows } = await admin
    .from("community_posts")
    .select(
      "id, body, created_at, prediction_closes_at, resolved_at, correct_option_id, points_for_correct",
    )
    .eq("artist_slug", slug)
    .eq("kind", "prediction")
    .order("created_at", { ascending: false });

  const postIds = (rows ?? []).map((r) => r.id as string);

  // Fetch options for all predictions in one query
  const optionsByPost = new Map<string, PollOption[]>();
  if (postIds.length > 0) {
    const { data: optionRows } = await admin
      .from("community_poll_options")
      .select("id, post_id, label, sort_order")
      .in("post_id", postIds)
      .order("sort_order", { ascending: true });

    for (const opt of optionRows ?? []) {
      const pid = opt.post_id as string;
      const arr = optionsByPost.get(pid) ?? [];
      arr.push({
        id: opt.id as string,
        label: opt.label as string,
        sort_order: opt.sort_order as number,
      });
      optionsByPost.set(pid, arr);
    }
  }

  const predictions: Prediction[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    body: r.body as string,
    created_at: r.created_at as string,
    prediction_closes_at: r.prediction_closes_at as string | null,
    resolved_at: r.resolved_at as string | null,
    correct_option_id: r.correct_option_id as string | null,
    points_for_correct: r.points_for_correct as number | null,
    options: optionsByPost.get(r.id as string) ?? [],
  }));

  const open = predictions.filter(
    (p) => predictionPhase(p) === "open",
  );
  const closed = predictions.filter(
    (p) => predictionPhase(p) === "closed",
  );
  const resolved = predictions.filter(
    (p) => predictionPhase(p) === "resolved",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/admin/artists/${slug}`}
            className="text-xs text-white/60 hover:text-white"
          >
            ← Back to {artist.name as string}
          </Link>
          <h1
            className="mt-2 text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Predictions — {artist.name as string}
          </h1>
          <p className="mt-1 text-xs text-white/60">
            {open.length} open · {closed.length} awaiting resolution ·{" "}
            {resolved.length} resolved
          </p>
        </div>
      </div>

      {/* Closed — needs resolution first */}
      {closed.length > 0 && (
        <section className="glass-card p-5">
          <p className="mb-3 text-sm font-semibold text-amber-300">
            Awaiting resolution ({closed.length})
          </p>
          <div className="space-y-5">
            {closed.map((p) => (
              <PredictionResolveCard
                key={p.id}
                prediction={p}
                artistSlug={slug}
              />
            ))}
          </div>
        </section>
      )}

      {/* Open */}
      {open.length > 0 && (
        <section className="glass-card p-5">
          <p className="mb-3 text-sm font-semibold">Open ({open.length})</p>
          <div className="space-y-4">
            {open.map((p) => (
              <PredictionCard key={p.id} prediction={p} phase="open" />
            ))}
          </div>
        </section>
      )}

      {/* Resolved */}
      {resolved.length > 0 && (
        <section className="glass-card p-5">
          <p className="mb-3 text-sm font-semibold text-white/60">
            Resolved ({resolved.length})
          </p>
          <div className="space-y-4">
            {resolved.map((p) => (
              <PredictionCard key={p.id} prediction={p} phase="resolved" />
            ))}
          </div>
        </section>
      )}

      {predictions.length === 0 && (
        <div className="glass-card p-5 text-sm text-white/50">
          No predictions yet for this artist.
        </div>
      )}
    </div>
  );
}

function PredictionCard({
  prediction,
  phase,
}: {
  prediction: Prediction;
  phase: "open" | "resolved";
}) {
  const correctOption = prediction.options.find(
    (o) => o.id === prediction.correct_option_id,
  );
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-sm text-white/90">{prediction.body}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {prediction.options.map((opt) => (
          <span
            key={opt.id}
            className={[
              "rounded-full px-2.5 py-0.5 text-xs",
              phase === "resolved" && opt.id === prediction.correct_option_id
                ? "bg-emerald-500/30 text-emerald-300 ring-1 ring-emerald-400/50"
                : "bg-white/10 text-white/60",
            ].join(" ")}
          >
            {opt.label}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-white/50">
        {phase === "open" &&
          prediction.prediction_closes_at &&
          `Closes ${new Date(prediction.prediction_closes_at).toLocaleString()}`}
        {phase === "resolved" &&
          correctOption &&
          `Correct: ${correctOption.label}${prediction.points_for_correct ? ` · ${prediction.points_for_correct} pts awarded` : ""}`}
      </p>
    </div>
  );
}

function PredictionResolveCard({
  prediction,
  artistSlug,
}: {
  prediction: Prediction;
  artistSlug: string;
}) {
  return (
    <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-4">
      <p className="text-sm text-white/90">{prediction.body}</p>
      {prediction.prediction_closes_at && (
        <p className="mt-1 text-xs text-white/50">
          Closed {new Date(prediction.prediction_closes_at).toLocaleString()}
        </p>
      )}
      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium text-white/60">
          Select the correct outcome:
        </p>
        <div className="flex flex-wrap gap-2">
          {prediction.options.map((opt) => (
            <ModerationButton
              key={opt.id}
              action={resolveAdminPredictionAction}
              fields={{
                prediction_id: prediction.id,
                winning_outcome_id: opt.id,
                artist_slug: artistSlug,
              }}
              label={opt.label}
              confirmMessage={`Mark "${opt.label}" as the correct outcome? This will award points to winners.`}
              className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80 hover:bg-emerald-500/30 hover:text-emerald-300 disabled:opacity-50"
            />
          ))}
        </div>
        {prediction.points_for_correct != null &&
          prediction.points_for_correct > 0 && (
            <p className="text-xs text-white/50">
              {prediction.points_for_correct} pts awarded to correct voters
            </p>
          )}
      </div>
    </div>
  );
}
