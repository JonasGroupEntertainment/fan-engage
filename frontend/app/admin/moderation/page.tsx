import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import {
  approveAction,
  hideAction,
  restoreToReviewAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface QueueRow {
  source_table: "community_posts" | "community_comments";
  id: string;
  community_id: string;
  body: string;
  title: string | null;
  status: string;
  severity: number | null;
  categories: string[] | null;
  reason: string | null;
  self_harm: boolean;
  classified_at: string | null;
  created_at: string;
  duplicate_of: string | null,
}

const SEVERITY_LABEL: Record<number, string> = {
  0: "Safe",
  1: "Mild",
  2: "Watch",
  3: "Concern",
  4: "Serious",
  5: "Severe",
};

const SEVERITY_TONE: Record<number, string> = {
  0: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  1: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200",
  2: "border-amber-300/30 bg-amber-300/10 text-amber-200",
  3: "border-amber-400/40 bg-amber-400/15 text-amber-100",
  4: "border-red-400/40 bg-red-400/15 text-red-200",
  5: "border-red-500/50 bg-red-500/20 text-red-100",
};

export default async function AdminModerationPage() {
  const adminContext = await getAdminContext();
  if (!adminContext) redirect("/login");

  const admin = createAdminClient();

  // Pull recent flag_review + auto_hide rows across community_posts +
  // community_comments. Limit to the last 200 to keep the page bounded;
  // we'll add pagination if volume warrants.
  const [postsRes, commentsRes] = await Promise.all([
    admin
      .from("community_posts")
      .select(
        "id, artist_slug, body, title, moderation_status, moderation_severity, moderation_categories, moderation_reason, moderation_self_harm, moderation_classified_at, created_at, duplicate_of",
      )
      .in("moderation_status", ["flag_review", "auto_hide"])
      .order("moderation_classified_at", { ascending: false, nullsFirst: false })
      .limit(100),
    admin
      .from("community_comments")
      .select(
        "id, post_id, body, moderation_status, moderation_severity, moderation_categories, moderation_reason, moderation_self_harm, moderation_classified_at, created_at, community_posts!inner(artist_slug)",
      )
      .in("moderation_status", ["flag_review", "auto_hide"])
      .order("moderation_classified_at", { ascending: false, nullsFirst: false })
      .limit(100),
  ]);

  const posts: QueueRow[] = (postsRes.data ?? []).map((p) => ({
    source_table: "community_posts" as const,
    id: p.id as string,
    community_id: p.artist_slug as string,
    body: p.body as string,
    title: (p.title as string | null) ?? null,
    status: p.moderation_status as string,
    severity: (p.moderation_severity as number | null) ?? null,
    categories: (p.moderation_categories as string[] | null) ?? null,
    reason: (p.moderation_reason as string | null) ?? null,
    self_harm: Boolean(p.moderation_self_harm),
    classified_at: (p.moderation_classified_at as string | null) ?? null,
    created_at: p.created_at as string,
    duplicate_of: ((p as { duplicate_of?: string | null }).duplicate_of) ?? null,
  }));

  const comments: QueueRow[] = (commentsRes.data ?? []).map((c) => {
    const parent = (c as unknown as {
      community_posts: { artist_slug: string };
    }).community_posts;
    return {
      source_table: "community_comments" as const,
      id: c.id as string,
      community_id: parent?.artist_slug ?? "(unknown)",
      body: c.body as string,
      title: null,
      status: c.moderation_status as string,
      severity: (c.moderation_severity as number | null) ?? null,
      categories: (c.moderation_categories as string[] | null) ?? null,
      reason: (c.moderation_reason as string | null) ?? null,
      self_harm: Boolean(c.moderation_self_harm),
      classified_at: (c.moderation_classified_at as string | null) ?? null,
      created_at: c.created_at as string,
      duplicate_of: ((c as { duplicate_of?: string | null }).duplicate_of) ?? null,
    };
  });

  // Sort merged list: self-harm first, then auto_hide, then by classified_at desc
  const queue: QueueRow[] = [...posts, ...comments].sort((a, b) => {
    if (a.self_harm !== b.self_harm) return a.self_harm ? -1 : 1;
    if (a.status !== b.status) return a.status === "auto_hide" ? -1 : 1;
    if (!a.classified_at) return 1;
    if (!b.classified_at) return -1;
    return b.classified_at.localeCompare(a.classified_at);
  });

  const counts = {
    total: queue.length,
    flag_review: queue.filter((q) => q.status === "flag_review").length,
    auto_hide: queue.filter((q) => q.status === "auto_hide").length,
    self_harm: queue.filter((q) => q.self_harm).length,
  };

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-white/60">
          Admin · Moderation
        </p>
        <h1
          className="text-3xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Moderation queue
        </h1>
        <p className="max-w-2xl text-sm text-white/70">
          Posts and comments the AI classifier flagged for human review.
          Self-harm signals stay visible by design — surface crisis
          resources to the author and check in. Approve clears the flag;
          Hide takes the row out of public view; Restore re-queues for
          another look.
        </p>

        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-white/80">
            Total: {counts.total}
          </span>
      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-200">
            Flag review: {counts.flag_review}
          </span>
          <span className="rounded-full border border-red-400/40 bg-red-400/10 px-3 py-1 text-red-200">
            Auto-hidden: {counts.auto_hide}
          </span>
          {counts.self_harm > 0 && (
            <span className="rounded-full border border-violet-400/40 bg-violet-400/15 px-3 py-1 text-violet-200">
              💜 Self-harm signal: {counts.self_harm}
            </span>
          )}
        </div>
      </header>

      {queue.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/60">
          No items pending review. The classifier is doing its job.
        </div>
      ) : (
        <ul className="space-y-4">
          {queue.map((row) => (
            <QueueCard key={`${row.source_table}-${row.id}`} row={row} />
          ))}
        </ul>
      )}
    </main>
  );
}

function QueueCard({ row }: { row: QueueRow }) {
  const sev = row.severity ?? 0;
  const sevLabel = SEVERITY_LABEL[sev] ?? "—";
  const sevTone = SEVERITY_TONE[sev] ?? SEVERITY_TONE[0];
  const previewBody = row.body.length > 600
    ? row.body.slice(0, 600) + "…"
    : row.body;

  return (
    <li className="glass-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 uppercase tracking-wide text-white/70">
              {row.source_table === "community_posts" ? "Post" : "Comment"}
            </span>
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 uppercase tracking-wide text-white/70">
              {row.community_id}
            </span>
            {row.duplicate_of ? <DuplicateChip targetId={row.duplicate_of} /> : null}
            <span
              className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${sevTone}`}
            >
              {sevLabel} ({sev})
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 uppercase tracking-wide ${
                row.status === "auto_hide"
                  ? "border-red-400/40 bg-red-400/10 text-red-200"
                  : "border-amber-400/30 bg-amber-400/10 text-amber-200"
              }`}
            >
              {row.status.replace("_", " ")}
            </span>
            {row.self_harm && (
              <span className="rounded-full border border-violet-400/40 bg-violet-400/15 px-2 py-0.5 uppercase tracking-wide text-violet-200">
                💜 Self-harm signal
              </span>
            )}
            {row.categories?.map((c) => (
              <span
                key={c}
                className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 uppercase tracking-wide text-white/60"
              >
                {c}
              </span>
            ))}
          </div>

          {row.title && (
            <p className="text-sm font-semibold text-white">{row.title}</p>
          )}
          <p className="whitespace-pre-line text-sm text-white/80">
            {previewBody}
          </p>

          {row.reason && (
            <p className="rounded-2xl border border-white/10 bg-black/30 p-3 text-xs text-white/70">
              <span className="text-white/50">AI reason: </span>
              {row.reason}
            </p>
          )}

          {row.self_harm && (
            <p className="rounded-2xl border border-violet-400/30 bg-violet-400/10 p-3 text-xs text-violet-100">
              The classifier detected self-harm signals in this content.
              Per platform policy this stays visible — please check in
              with the author and surface crisis resources rather than
              hiding the post.
            </p>
          )}

          <p className="text-xs text-white/50">
            Classified{" "}
            {row.classified_at
              ? new Date(row.classified_at).toLocaleString()
              : "—"}{" "}
            · Posted {new Date(row.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <form action={approveAction}>
            <input type="hidden" name="table" value={row.source_table} />
            <input type="hidden" name="row_id" value={row.id} />
            <button
              type="submit"
              className="w-full rounded-full border border-emerald-300/30 bg-emerald-300/10 px-4 py-2 text-xs font-medium text-emerald-200 hover:bg-emerald-300/15"
            >
              Approve
            </button>
          </form>
          <form action={hideAction}>
            <input type="hidden" name="table" value={row.source_table} />
            <input type="hidden" name="row_id" value={row.id} />
            <button
              type="submit"
              className="w-full rounded-full border border-red-400/40 bg-red-400/10 px-4 py-2 text-xs font-medium text-red-200 hover:bg-red-400/15"
            >
              Hide
            </button>
          </form>
          <form action={restoreToReviewAction}>
            <input type="hidden" name="table" value={row.source_table} />
            <input type="hidden" name="row_id" value={row.id} />
            <button
              type="submit"
              className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white/70 hover:bg-white/10"
            >
              Re-queue
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

// AI #20: warning chip rendered when a community post is suspected to
// duplicate another. Kept inside this file to keep the page change tight.
function DuplicateChip({ targetId }: { targetId: string }) {
  return (
    <span
      title={`Likely duplicate of post ${targetId}`}
      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-300"
    >
      <span aria-hidden>⚠</span>
      Likely duplicate
    </span>
  );
}
