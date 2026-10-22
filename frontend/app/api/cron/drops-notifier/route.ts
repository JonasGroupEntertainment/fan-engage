import { runCron } from "@/lib/cron-run";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  notifyDropExpiring,
  notifyDropLaunched,
} from "@/lib/notifications/triggers/drop";

/**
 * Cron: GET /api/cron/drops-notifier
 *
 * Fires two kinds of pushes for limited-time reward drops:
 *
 *   1. LAUNCHED — drops_at just passed (≤ 30 min ago) and we haven't
 *      already fired the launched notification.
 *   2. EXPIRING — expires_at is within the next 75 min and we haven't
 *      already fired the 1-hour-warning. Slack of 75 min covers a
 *      worst-case 15-min cron schedule slip.
 *
 * Idempotent via reward_drop_notifications dedupe rows.
 *
 * Called from vercel.json on the every-15-min schedule.
 *
 * Auth: requires CRON_SECRET in the Authorization: Bearer <secret> header
 * (matches the existing FE cron auth pattern).
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const LAUNCHED_LOOKBACK_MS = 30 * 60 * 1000;       // 30 min
const EXPIRING_LOOKAHEAD_MS = 75 * 60 * 1000;      // 75 min

export async function GET(request: Request) {
  return runCron(request, "drops-notifier", () => dropsNotifier());
}

async function dropsNotifier() {
  const admin = createAdminClient();
  const now = new Date();
  const launchedAfter = new Date(now.getTime() - LAUNCHED_LOOKBACK_MS).toISOString();
  const expiringBefore = new Date(now.getTime() + EXPIRING_LOOKAHEAD_MS).toISOString();
  const nowIso = now.toISOString();

  const result = {
    launched: { fired: 0, skipped: 0 },
    expiring: { fired: 0, skipped: 0 },
    errors: [] as string[],
  };

  // ── 1. Newly-launched drops ──────────────────────────────────────────
  try {
    const { data: justLaunched } = await admin
      .from("rewards_catalog")
      .select(
        "id, title, description, community_id, drops_at, expires_at, active, is_drop, stock",
      )
      .eq("is_drop", true)
      .eq("active", true)
      .gte("drops_at", launchedAfter)
      .lte("drops_at", nowIso);

    for (const row of justLaunched ?? []) {
      const rewardId = row.id as string;
      const artistSlug = row.community_id as string | null;
      const stock = row.stock as number | null;
      if (!artistSlug) {
        result.launched.skipped += 1;
        continue;
      }
      // Skip if stock is tracked and sold out — no point notifying fans.
      if (stock !== null && stock <= 0) {
        result.launched.skipped += 1;
        continue;
      }

      // Dedupe — try-insert; if conflict, skip.
      const { error: dedupeErr } = await admin
        .from("reward_drop_notifications")
        .insert({ reward_id: rewardId, kind: "launched" });
      if (dedupeErr) {
        // Most common: 23505 unique violation → already fired; skip silently.
        result.launched.skipped += 1;
        continue;
      }

      await notifyDropLaunched({
        rewardId,
        artistSlug,
        rewardTitle: row.title as string,
        rewardDescription: row.description as string | null,
        expiresAt: row.expires_at as string | null,
      });
      result.launched.fired += 1;
    }
  } catch (err) {
    result.errors.push(`launched: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 2. Drops expiring in ~1 hour ─────────────────────────────────────
  try {
    const { data: expiringSoon } = await admin
      .from("rewards_catalog")
      .select(
        "id, title, community_id, expires_at, active, is_drop, drops_at, stock",
      )
      .eq("is_drop", true)
      .eq("active", true)
      .gt("expires_at", nowIso)
      .lte("expires_at", expiringBefore);

    for (const row of expiringSoon ?? []) {
      const rewardId = row.id as string;
      const artistSlug = row.community_id as string | null;
      const expiresAt = row.expires_at as string | null;
      const stock = row.stock as number | null;
      if (!artistSlug || !expiresAt) {
        result.expiring.skipped += 1;
        continue;
      }
      // Skip the 1-hour warning if the drop is already sold out.
      if (stock !== null && stock <= 0) {
        result.expiring.skipped += 1;
        continue;
      }
      // Don't fire expiring before drops_at — handles the edge case
      // of an admin creating a 30-min-window drop.
      if (row.drops_at && new Date(row.drops_at as string).getTime() > now.getTime()) {
        result.expiring.skipped += 1;
        continue;
      }

      const { error: dedupeErr } = await admin
        .from("reward_drop_notifications")
        .insert({ reward_id: rewardId, kind: "expiring" });
      if (dedupeErr) {
        result.expiring.skipped += 1;
        continue;
      }

      await notifyDropExpiring({
        rewardId,
        artistSlug,
        rewardTitle: row.title as string,
        expiresAt,
      });
      result.expiring.fired += 1;
    }
  } catch (err) {
    result.errors.push(`expiring: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ ok: true, ...result, ranAt: nowIso });
}
