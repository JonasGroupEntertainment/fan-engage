import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "../send";
import { inboxDedupKey } from "../inbox-mirror";
import { dropExpiringCopy, dropLaunchedCopy } from "../reminder-copy";

/**
 * Notify followers of an artist when a limited-time reward drop goes
 * live. Uses the existing `notify_drops` preference flag from Phase 2 —
 * fans who opted out of drop pushes won't be paged.
 *
 * Caller (the drops-notifier cron) is responsible for:
 *   - Selecting rewards where drops_at just crossed
 *   - Inserting the (reward_id, kind='launched') dedupe row
 *
 * This function is the per-reward fan-out only.
 */
export async function notifyDropLaunched(opts: {
  rewardId: string;
  artistSlug: string;
  rewardTitle: string;
  rewardDescription?: string | null;
  expiresAt?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: artist } = await admin
      .from("artists")
      .select("name")
      .eq("slug", opts.artistSlug)
      .maybeSingle();
    if (!artist) return;

    const { data: follows } = await admin
      .from("fan_artist_following")
      .select("fan_id")
      .eq("artist_slug", opts.artistSlug);
    const fanIds = (follows ?? []).map((r) => r.fan_id as string);
    if (fanIds.length === 0) return;

    const copy = dropLaunchedCopy({
      artistName: artist.name as string,
      artistSlug: opts.artistSlug,
      rewardTitle: opts.rewardTitle,
      rewardDescription: opts.rewardDescription,
    });

    const MAX_CONCURRENT = 200;
    await Promise.all(
      fanIds.slice(0, MAX_CONCURRENT).map((fanId) =>
        sendNotification({
          fanId,
          type: "drops",
          smsMessageType: "drop_launched",
          payload: {
            title: copy.title,
            body: copy.body,
            url: copy.url,
            tag: `drop_launched:${opts.rewardId}`,
          },
          inbox: {
            kind: "drop_launched",
            dedupKey: inboxDedupKey("drop_launched", opts.rewardId),
            body: copy.inboxBody,
            url: copy.url,
            communityId: opts.artistSlug,
          },
        }),
      ),
    );
  } catch (err) {
    console.warn("notifyDropLaunched failed (non-blocking):", err);
  }
}

/**
 * Notify followers ~1 hour before a drop expires. Same fan-out pattern
 * as notifyDropLaunched. Skips fans who already redeemed this reward.
 */
export async function notifyDropExpiring(opts: {
  rewardId: string;
  artistSlug: string;
  rewardTitle: string;
  expiresAt: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const [{ data: artist }, { data: follows }, { data: redemptions }] =
      await Promise.all([
        admin
          .from("artists")
          .select("name")
          .eq("slug", opts.artistSlug)
          .maybeSingle(),
        admin
          .from("fan_artist_following")
          .select("fan_id")
          .eq("artist_slug", opts.artistSlug),
        admin
          .from("reward_redemptions")
          .select("fan_id")
          .eq("reward_id", opts.rewardId)
          .neq("status", "cancelled"),
      ]);

    if (!artist) return;

    const followerIds = (follows ?? []).map((r) => r.fan_id as string);
    const alreadyRedeemed = new Set<string>(
      (redemptions ?? []).map((r) => r.fan_id as string),
    );
    const targets = followerIds.filter((id) => !alreadyRedeemed.has(id));
    if (targets.length === 0) return;

    const expiresMs = new Date(opts.expiresAt).getTime();
    const copy = dropExpiringCopy({
      artistSlug: opts.artistSlug,
      rewardTitle: opts.rewardTitle,
      minutesLeft: (expiresMs - Date.now()) / 60000,
    });

    const MAX_CONCURRENT = 200;
    await Promise.all(
      targets.slice(0, MAX_CONCURRENT).map((fanId) =>
        sendNotification({
          fanId,
          type: "drops",
          smsMessageType: "drop_expiring",
          payload: {
            title: copy.title,
            body: copy.body,
            url: copy.url,
            tag: `drop_expiring:${opts.rewardId}`,
          },
          inbox: {
            kind: "drop_expiring",
            dedupKey: inboxDedupKey("drop_expiring", opts.rewardId),
            body: copy.inboxBody,
            url: copy.url,
            communityId: opts.artistSlug,
          },
        }),
      ),
    );
  } catch (err) {
    console.warn("notifyDropExpiring failed (non-blocking):", err);
  }
}
