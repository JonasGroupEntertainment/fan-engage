/**
 * /admin/segments
 *
 * AI #16: Auto-segmentation. Admins describe a fan audience in plain
 * English; Claude translates to a structured filter; the system saves
 * the segment with a cached fan_ids list and member count.
 */

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "@/lib/admin";
import type { SegmentFilter, SegmentRow } from "@/lib/segments";
import {
  createSegmentAction,
  refreshSegmentAction,
  deleteSegmentAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSegmentsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");
  const communityId =
    (ctx as unknown as { communityId?: string }).communityId ??
    (ctx as unknown as { artist_slug?: string }).artist_slug ??
    (ctx as unknown as { activeCommunityId?: string }).activeCommunityId ??
    "";
  if (!communityId) redirect("/admin");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("audience_segments")
    .select(
      "id, artist_slug, name, description_input, filter_json, member_count, fan_ids, created_at, refreshed_at",
    )
    .eq("artist_slug", communityId)
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
        Failed to load segments: {error.message}
      </div>
    );
  }

  const segments = (data ?? []) as unknown as SegmentRow[];

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-wide text-white/60">
          Admin · Segments
        </p>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Audience segments
        </h1>
        <p className="max-w-2xl text-sm text-white/70">
          Describe a fan group in plain English. Claude translates it into
          a structured filter and the system saves a named segment with the
          matching fans cached. Use these for targeted notifications,
          email exports, and reports.
        </p>
      </header>

      <section className="glass-card space-y-4 p-6">
        <h2 className="text-lg font-semibold">Create a new segment</h2>
        <form action={createSegmentAction} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-white/60">
              Segment name
            </label>
            <input
              type="text"
              name="name"
              required
              maxLength={80}
              placeholder="Tennessee fan experiences"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm placeholder-white/40 outline-none focus:border-aurora/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-white/60">
              Describe your audience
            </label>
            <textarea
              name="description"
              required
              rows={3}
              maxLength={400}
              placeholder="super-engaged gold/platinum fans in Tennessee who've posted in the last month"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm placeholder-white/40 outline-none focus:border-aurora/40"
            />
            <p className="mt-1 text-xs text-white/50">
              Examples: &quot;new bronze fans this month&quot;, &quot;loyal
              fans willing to receive SMS&quot;, &quot;high-points members
              in California&quot;.
            </p>
          </div>
          <button
            type="submit"
            className="rounded-full bg-gradient-to-r from-aurora to-ember px-5 py-2 text-sm font-semibold text-white shadow-glass"
          >
            Generate segment
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Saved segments</h2>
        {segments.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-white/60">
            No segments yet. Use the form above to create one.
          </p>
        ) : (
          <ul className="space-y-3">
            {segments.map((s) => (
              <SegmentCard key={s.id} segment={s} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SegmentCard({ segment }: { segment: SegmentRow }) {
  const refreshed = new Date(segment.refreshed_at);
  // eslint-disable-next-line react-hooks/purity
  const hours = Math.floor((Date.now() - refreshed.getTime()) / 3_600_000);
  const refreshedLabel =
    hours < 1
      ? "Just now"
      : hours < 24
        ? `${hours}h ago`
        : `${Math.floor(hours / 24)}d ago`;

  return (
    <li className="glass-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-base font-semibold text-white">{segment.name}</p>
          {segment.description_input && (
            <p className="text-xs italic text-white/60">
              &ldquo;{segment.description_input}&rdquo;
            </p>
          )}
          <p className="text-xs text-white/50">
            <span className="font-semibold text-aurora">
              {segment.member_count}
            </span>{" "}
            {segment.member_count === 1 ? "fan" : "fans"} · refreshed{" "}
            {refreshedLabel}
          </p>
          <FilterChips filter={segment.filter_json} />
          <details>
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-white/50">
              Filter JSON
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-xl bg-black/50 p-3 text-xs text-white/70">
              {JSON.stringify(segment.filter_json, null, 2)}
            </pre>
          </details>
        </div>
        <div className="flex flex-col gap-2">
          <form action={refreshSegmentAction}>
            <input type="hidden" name="segment_id" value={segment.id} />
            <button
              type="submit"
              className="w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white/80 hover:bg-white/10"
            >
              Refresh
            </button>
          </form>
          <form action={deleteSegmentAction}>
            <input type="hidden" name="segment_id" value={segment.id} />
            <button
              type="submit"
              className="w-full rounded-full border border-red-400/30 bg-red-400/10 px-4 py-2 text-xs font-medium text-red-200 hover:bg-red-400/15"
            >
              Delete
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}

function FilterChips({ filter }: { filter: SegmentFilter }) {
  const chips: string[] = [];
  if (filter.tiers && filter.tiers.length > 0) {
    chips.push(`Tier: ${filter.tiers.join(", ")}`);
  }
  if (filter.total_points_min !== undefined) {
    chips.push(`≥${filter.total_points_min} points`);
  }
  if (filter.total_points_max !== undefined) {
    chips.push(`≤${filter.total_points_max} points`);
  }
  if (filter.city_contains) chips.push(`City: ${filter.city_contains}`);
  if (filter.interest_contains) chips.push(`Interest: ${filter.interest_contains}`);
  if (filter.sms_opted_in) chips.push("SMS opted in");
  if (filter.email_opted_in) chips.push("Email opted in");
  if (filter.signup_within_days) chips.push(`Signed up ≤${filter.signup_within_days}d`);
  if (filter.signup_older_than_days)
    chips.push(`Signed up >${filter.signup_older_than_days}d`);
  if (filter.min_posts_last_30d) chips.push(`≥${filter.min_posts_last_30d} posts/30d`);

  if (chips.length === 0) {
    return (
      <p className="text-xs text-white/50">(no filters — matches all fans)</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span
          key={c}
          className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-white/70"
        >
          {c}
        </span>
      ))}
    </div>
  );
}
