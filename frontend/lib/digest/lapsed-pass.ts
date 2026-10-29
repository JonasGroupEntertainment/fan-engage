import { APP_URL } from "../app-url.ts";
import { pageAll, pageAllIn, type PageQuery } from "../supabase/page-all.ts";
import {
  LAPSED_NUDGE_KIND,
  countBuckets,
  groupMemberships,
  lapsedActivityCutoffIso,
  lapsedDedupKey,
  lapsedResendCutoffIso,
  latestActivityByFan,
  recentlyNudgedIds,
  selectLapsedFans,
  type ActivityBucket,
  type ActivitySignal,
  type LapsedCandidate,
  type LapsedFanRow,
} from "./lapsed.ts";
import { buildLapsedEmail } from "./lapsed-email.ts";
import {
  lapsedProvider,
  sendLapsedBatch,
  type LapsedBatchResult,
  type LapsedProvider,
  type LapsedRecipient,
} from "./lapsed-send.ts";

/**
 * The "we miss you" pass of the weekly digest. Selection is pure
 * (lib/digest/lapsed.ts); this module does the reads, the send and the
 * notification_log bookkeeping.
 *
 * Every read is paged with pageAll (PostgREST caps a select at 1,000 rows
 * and truncates silently — a cut ledger would make an active fan look
 * lapsed), and the one `.in()` read is chunked to 200 ids:
 *   fans                         id, email, first_name, last_active_date,
 *                                created_at, is_internal
 *                                where email_opted_in and not suspended
 *   points_ledger                fan_id, created_at   (>= 31 days ago)
 *   checkins                     fan_id, created_at   (>= 31 days ago)
 *   fan_community_memberships    fan_id, community_id (status active, by joined_at)
 *   notification_log             fan_id, sent_at      (lapsed_nudge, sent, <= 30 days)
 *   notification_preferences     fan_id               (notify_weekly_digest = false)
 *   artists                      slug, name           (the candidates' slugs)
 *
 * Imports are relative so the module loads under node --test with a stub
 * client (lapsed-pass.test.ts); the route passes the real admin client.
 */

export type LapsedPassResult = {
  provider: LapsedProvider | null;
  /** Every opted-in fan fetched, by bucket, before the other filters. */
  buckets: Record<ActivityBucket, number>;
  /** Fans in the 14–30 day window after every filter. */
  candidates: number;
  sent: number;
  failed: number;
  /** Candidates dropped by ?testEmail. */
  skipped: number;
  campaignId: string | null;
  /** Dry runs only: up to 10 candidates. */
  sample?: Array<{ fanId: string; bucket: "lapsed"; artistSlug: string; daysSinceActivity: number }>;
  error: string | null;
};

type Row = Record<string, unknown>;

/**
 * The slice of the Supabase client the pass uses. Narrow on purpose so a
 * test can hand in a stub; `createAdminClient()` satisfies it.
 */
export type LapsedFilterBuilder = PageQuery<Row> & {
  eq(column: string, value: unknown): LapsedFilterBuilder;
  not(column: string, op: string, value: unknown): LapsedFilterBuilder;
  gte(column: string, value: unknown): LapsedFilterBuilder;
  in(column: string, values: readonly unknown[]): LapsedFilterBuilder;
  order(column: string, opts?: { ascending?: boolean }): LapsedFilterBuilder;
};
export type LapsedTableBuilder = {
  select(columns: string): LapsedFilterBuilder;
  insert(rows: Row[]): PromiseLike<{ error: { message: string } | null }>;
};
export type LapsedClient = { from(table: string): LapsedTableBuilder };

export async function runLapsedPass(params: {
  admin: LapsedClient;
  testEmail: string | null;
  dryRun: boolean;
  now?: Date;
  /** Test seam; defaults to the real provider dispatch. */
  send?: (recipients: readonly LapsedRecipient[]) => Promise<LapsedBatchResult>;
  baseHref?: string;
}): Promise<LapsedPassResult> {
  const { admin, testEmail, dryRun } = params;
  const now = params.now ?? new Date();
  const send = params.send ?? ((r) => sendLapsedBatch(r));
  const activityCutoff = lapsedActivityCutoffIso(now);
  const resendCutoff = lapsedResendCutoffIso(now);

  const [fansRes, ledgerRes, checkinsRes, membershipsRes, nudgesRes, optOutRes] =
    await Promise.all([
      pageAll(() =>
        admin
          .from("fans")
          .select("id, email, first_name, last_active_date, created_at, is_internal")
          .eq("email_opted_in", true)
          .eq("suspended", false)
          .not("email", "is", null)
          .order("created_at", { ascending: true }),
      ),
      pageAll(() =>
        admin
          .from("points_ledger")
          .select("fan_id, created_at")
          .gte("created_at", activityCutoff)
          .order("created_at", { ascending: true }),
      ),
      pageAll(() =>
        admin
          .from("checkins")
          .select("fan_id, created_at")
          .gte("created_at", activityCutoff)
          .order("created_at", { ascending: true }),
      ),
      pageAll(() =>
        admin
          .from("fan_community_memberships")
          .select("fan_id, community_id")
          .eq("status", "active")
          .order("joined_at", { ascending: true }),
      ),
      pageAll(() =>
        admin
          .from("notification_log")
          .select("fan_id, sent_at")
          .eq("notification_type", LAPSED_NUDGE_KIND)
          .eq("status", "sent")
          .gte("sent_at", resendCutoff)
          .order("sent_at", { ascending: true }),
      ),
      pageAll(() =>
        admin
          .from("notification_preferences")
          .select("fan_id")
          .eq("notify_weekly_digest", false)
          .order("fan_id", { ascending: true }),
      ),
    ]);

  for (const [label, res] of [
    ["fans", fansRes],
    ["points_ledger", ledgerRes],
    ["checkins", checkinsRes],
    ["fan_community_memberships", membershipsRes],
    ["notification_log", nudgesRes],
    ["notification_preferences", optOutRes],
  ] as const) {
    if (res.error) throw new Error(`${label}: ${res.error.message}`);
  }

  const signal = (rows: Row[] | null): ActivitySignal[] =>
    (rows ?? []).map((r) => ({
      fan_id: String(r.fan_id ?? ""),
      at: (r.created_at as string | null) ?? null,
    }));

  const lastActivity = latestActivityByFan([
    ...signal(ledgerRes.data),
    ...signal(checkinsRes.data),
  ]);
  const fans = (fansRes.data ?? []) as unknown as LapsedFanRow[];
  const buckets = countBuckets(fans, lastActivity, now);

  const artistSlugsByFan = groupMemberships(
    (membershipsRes.data ?? []).map((r) => ({
      fan_id: String(r.fan_id ?? ""),
      community_id: String(r.community_id ?? ""),
    })),
  );
  const recentlyNudged = recentlyNudgedIds(
    (nudgesRes.data ?? []).map((r) => ({
      fan_id: String(r.fan_id ?? ""),
      sent_at: (r.sent_at as string | null) ?? null,
    })),
    now,
  );
  const digestOptOut = new Set((optOutRes.data ?? []).map((r) => String(r.fan_id ?? "")));

  const all = selectLapsedFans({ fans, lastActivity, artistSlugsByFan, recentlyNudged, digestOptOut, now });

  let skipped = 0;
  const candidates: LapsedCandidate[] = [];
  const wanted = testEmail?.trim().toLowerCase() ?? null;
  for (const c of all) {
    if (wanted && c.email.toLowerCase() !== wanted) skipped++;
    else candidates.push(c);
  }

  const base: LapsedPassResult = {
    provider: lapsedProvider().provider,
    buckets,
    candidates: candidates.length,
    sent: 0,
    failed: 0,
    skipped,
    campaignId: null,
    error: null,
  };

  if (dryRun) {
    return {
      ...base,
      sample: candidates.slice(0, 10).map((c) => ({
        fanId: c.id,
        bucket: c.bucket,
        artistSlug: c.artistSlug,
        daysSinceActivity: c.daysSinceActivity,
      })),
    };
  }
  if (candidates.length === 0) return base;

  // Artist names for the copy — one chunked query for every slug in play.
  const slugs = Array.from(new Set(candidates.map((c) => c.artistSlug)));
  const artistsRes = await pageAllIn(slugs, (part) =>
    admin.from("artists").select("slug, name").in("slug", part).order("slug", { ascending: true }),
  );
  if (artistsRes.error) throw new Error(`artists: ${artistsRes.error.message}`);
  const artistName = new Map<string, string>();
  for (const a of artistsRes.data) {
    artistName.set(String(a.slug ?? ""), String(a.name ?? a.slug ?? ""));
  }

  const recipients: LapsedRecipient[] = candidates.map((c) => ({
    fanId: c.id,
    email: c.email,
    firstName: c.firstName,
    content: buildLapsedEmail({
      firstName: c.firstName,
      artistSlug: c.artistSlug,
      artistName: artistName.get(c.artistSlug) ?? c.artistSlug,
      daysSinceActivity: c.daysSinceActivity,
      baseHref: params.baseHref ?? APP_URL,
    }),
  }));

  const batch = await send(recipients);
  const byFan = new Map(recipients.map((r) => [r.fanId, r]));
  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const dedupKey = lapsedDedupKey(now);

  // One notification_log row per attempt. A 'sent' row is what the next
  // 30 days of runs read to skip this fan; a 'failed' row is not.
  const logRows: Row[] = batch.outcomes.map((o) => {
    const r = byFan.get(o.fanId);
    const c = candidateById.get(o.fanId);
    return {
      fan_id: o.fanId,
      channel: "email",
      notification_type: LAPSED_NUDGE_KIND,
      title: r?.content.subject ?? null,
      body: r?.content.text ?? null,
      url: r?.content.ctaPath ?? null,
      status: o.ok ? "sent" : "failed",
      error: o.error ?? null,
      metadata: {
        dedup_key: dedupKey,
        bucket: c?.bucket ?? "lapsed",
        artist_slug: c?.artistSlug ?? null,
        days_since_activity: c?.daysSinceActivity ?? null,
        provider: batch.provider,
        campaign_id: batch.campaignId,
      },
      sent_at: now.toISOString(),
    };
  });
  const sent = batch.outcomes.filter((o) => o.ok).length;
  const failed = batch.outcomes.filter((o) => !o.ok).length;
  if (logRows.length > 0) {
    const { error: logErr } = await admin.from("notification_log").insert(logRows);
    if (logErr) {
      // The sends went out; without the rows the next run would resend.
      console.error("[weekly-digest] lapsed: notification_log insert failed:", logErr.message);
      return {
        ...base,
        provider: batch.provider,
        sent,
        failed,
        campaignId: batch.campaignId,
        error: `notification_log insert failed: ${logErr.message}`,
      };
    }
  }

  return { ...base, provider: batch.provider, sent, failed, campaignId: batch.campaignId, error: batch.error };
}
