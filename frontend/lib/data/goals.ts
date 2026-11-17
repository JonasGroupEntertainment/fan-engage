import { createAdminClient } from "@/lib/supabase/admin";
import { getFoundingFanClaimState } from "@/lib/data/founding-fans";

/**
 * Campaign goals — admin-configurable rows in public.community_goals that
 * drive the "Campaign Goals" progress bars on the artist page. Replaces
 * the previous hardcoded founder/RSVP goals so campaigns like "Rally the
 * 250" can be launched from the database without a deploy.
 *
 * `current` is computed per metric:
 *   founder_count → `getFoundingFanClaimState` (1–100 founding numbers).
 *                   Cap is FOUNDING_FAN_CAP, not the goal row target and
 *                   not paid `is_founder` slots.
 *   rsvp_total    → passed in by the caller (page already fetches it)
 *   ledger_count  → count of this community's points_ledger rows where
 *                   source = metric_ref, internal fans excluded
 *                   (e.g. one row per pre-save with source 'presave_american_made')
 *   manual        → the row's manual_current column
 */

export interface CampaignGoal {
  id: string;
  emoji: string;
  label: string;
  target: number;
  current: number;
  linkHref: string | null;
  linkLabel: string | null;
}

interface GoalRow {
  id: string;
  emoji: string;
  label: string;
  target: number;
  metric: "founder_count" | "rsvp_total" | "ledger_count" | "manual";
  metric_ref: string | null;
  manual_current: number;
  link_href: string | null;
  link_label: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export async function getCampaignGoals(
  communityId: string,
  live: { rsvpTotal: number },
): Promise<CampaignGoal[]> {
  try {
    const admin = createAdminClient();
    const { data: rows } = await admin
      .from("community_goals")
      .select(
        "id, emoji, label, target, metric, metric_ref, manual_current, link_href, link_label, starts_at, ends_at",
      )
      .eq("community_id", communityId)
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (!rows || rows.length === 0) return [];

    const now = Date.now();
    const inWindow = (rows as GoalRow[]).filter((r) => {
      if (r.starts_at && new Date(r.starts_at).getTime() > now) return false;
      if (r.ends_at && new Date(r.ends_at).getTime() < now) return false;
      return true;
    });

    // Ids of internal / test fans (fans.is_internal) as a PostgREST "in"
    // list, fetched once and only when a ledger goal needs it.
    let internalFilter: Promise<string | null> | null = null;
    const internalFanFilter = () => {
      internalFilter ??= (async () => {
        const { data } = await admin.from("fans").select("id").eq("is_internal", true).limit(2000);
        const ids = ((data ?? []) as Array<{ id: string }>).map((f) => f.id);
        return ids.length > 0 ? `(${ids.join(",")})` : null;
      })();
      return internalFilter;
    };

    const needsFounding = inWindow.some((r) => r.metric === "founder_count");
    const founding = needsFounding
      ? await getFoundingFanClaimState(communityId)
      : null;

    return Promise.all(
      inWindow.map(async (r): Promise<CampaignGoal> => {
        let current = 0;
        let target = r.target;
        if (r.metric === "founder_count" && founding) {
          current = founding.claimed;
          target = founding.cap;
        } else if (r.metric === "rsvp_total") current = live.rsvpTotal;
        else if (r.metric === "manual") current = r.manual_current;
        else if (r.metric === "ledger_count" && r.metric_ref) {
          // Scoped to this community, and internal / test fans never count
          // (port of BEP #187): progress is shown to guests, and staff and
          // QA activity made it look further along than it was.
          let q = admin
            .from("points_ledger")
            .select("id", { count: "exact", head: true })
            .eq("community_id", communityId)
            .eq("source", r.metric_ref);
          const internalIds = await internalFanFilter();
          if (internalIds) q = q.not("fan_id", "in", internalIds);
          const { count } = await q;
          current = count ?? 0;
        }
        return {
          id: r.id,
          emoji: r.emoji,
          label: r.label,
          target,
          current,
          linkHref: r.link_href,
          linkLabel: r.link_label,
        };
      }),
    );
  } catch (err) {
    console.warn("getCampaignGoals failed (non-blocking):", err);
    return [];
  }
}
