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
 *   ledger_count  → count of points_ledger rows where source = metric_ref
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
          const { count } = await admin
            .from("points_ledger")
            .select("id", { count: "exact", head: true })
            .eq("source", r.metric_ref);
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
