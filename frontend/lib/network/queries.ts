import { createAdminClient } from "@/lib/supabase/admin";
import type {
  FanEvent,
  NetworkEventSummaryRow,
  NetworkPublisherStatus,
  NetworkSuperfanScore,
  SuperfanScoreWithFan,
} from "./types";

/**
 * Read-only queries against the Jonas Network objects in this project.
 * All of them use the service-role client — the network tables have RLS
 * enabled with no policies, so anon/authenticated reads return nothing.
 */

/** Events per day per source app for the last `days` days. */
export async function getNetworkEventSummary(
  days = 14,
): Promise<NetworkEventSummaryRow[]> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const { data, error } = await admin
    .from("network_event_summary")
    .select("day, source_app, event_type, events")
    .gte("day", since)
    .order("day", { ascending: false });
  if (error) throw new Error(`network_event_summary: ${error.message}`);
  return (data ?? []) as NetworkEventSummaryRow[];
}

/** Latest fan events, newest first. Pass `sinceId` to only get newer rows. */
export async function getRecentFanEvents(
  limit = 50,
  sinceId?: number,
): Promise<FanEvent[]> {
  const admin = createAdminClient();
  let q = admin
    .from("fan_events")
    .select(
      "id, event_type, source_app, local_actor_id, network_id, hub_fan_id, artist_slug, entity_type, entity_id, occurred_at, received_at, metadata, dedupe_key",
    )
    .order("id", { ascending: false })
    .limit(limit);
  if (sinceId !== undefined) q = q.gt("id", sinceId);
  const { data, error } = await q;
  if (error) throw new Error(`fan_events: ${error.message}`);
  return (data ?? []) as FanEvent[];
}

/** Publisher roster WITHOUT api keys. Keys stay in the database. */
export async function getPublisherStatuses(): Promise<NetworkPublisherStatus[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("network_publishers")
    .select("app_name, enabled, created_at")
    .order("app_name");
  if (error) throw new Error(`network_publishers: ${error.message}`);
  return (data ?? []) as NetworkPublisherStatus[];
}

/**
 * Top superfan scores joined to hub fans for display names.
 * The view keys on network_id, so we hop network_identities → fans.
 */
export async function getTopSuperfans(
  limit = 50,
): Promise<SuperfanScoreWithFan[]> {
  const admin = createAdminClient();

  const { data: scores, error } = await admin
    .from("network_superfan_scores")
    .select("network_id, artist_slug, score, event_count")
    .order("score", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`network_superfan_scores: ${error.message}`);
  const rows = (scores ?? []) as NetworkSuperfanScore[];
  if (rows.length === 0) return [];

  const networkIds = [...new Set(rows.map((r) => r.network_id))];
  const { data: identities } = await admin
    .from("network_identities")
    .select("network_id, hub_fan_id")
    .in("network_id", networkIds)
    .not("hub_fan_id", "is", null);

  const fanIdByNetwork = new Map<string, string>();
  for (const i of identities ?? []) {
    if (i.hub_fan_id && !fanIdByNetwork.has(i.network_id)) {
      fanIdByNetwork.set(i.network_id, i.hub_fan_id);
    }
  }

  const fanIds = [...new Set(fanIdByNetwork.values())];
  const fanById = new Map<
    string,
    { first_name: string | null; last_name: string | null; email: string | null }
  >();
  if (fanIds.length > 0) {
    const { data: fans } = await admin
      .from("fans")
      .select("id, first_name, last_name, email")
      .in("id", fanIds);
    for (const f of fans ?? []) {
      fanById.set(f.id, {
        first_name: f.first_name,
        last_name: f.last_name,
        email: f.email as string | null,
      });
    }
  }

  return rows.map((r) => {
    const hubFanId = fanIdByNetwork.get(r.network_id) ?? null;
    const fan = hubFanId ? fanById.get(hubFanId) : undefined;
    const name = fan
      ? [fan.first_name, fan.last_name].filter(Boolean).join(" ") || null
      : null;
    return {
      ...r,
      hub_fan_id: hubFanId,
      fan_name: name,
      fan_email: fan?.email ?? null,
    };
  });
}
