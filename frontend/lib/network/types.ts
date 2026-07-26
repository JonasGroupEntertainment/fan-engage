/**
 * Types for the Jonas Network tables that live in this (hub) Supabase project.
 * These objects were created by the jonas-network migrations (see the
 * jonas-network repo, supabase/hub/migrations) — the app only reads them.
 *
 * fan_events / network_identities / network_publishers have RLS enabled with
 * no policies, so every read MUST go through the service-role client.
 */

export interface NetworkIdentity {
  source_app: string;
  local_id: string;
  network_id: string;
  email_norm: string | null;
  hub_fan_id: string | null;
  first_seen_at: string;
}

export interface FanEvent {
  id: number;
  event_type: string;
  source_app: string;
  local_actor_id: string | null;
  network_id: string | null;
  hub_fan_id: string | null;
  artist_slug: string | null;
  entity_type: string | null;
  entity_id: string | null;
  occurred_at: string;
  received_at: string;
  metadata: Record<string, unknown>;
  dedupe_key: string | null;
}

/** network_publishers row WITHOUT api_key — the key never leaves the DB. */
export interface NetworkPublisherStatus {
  app_name: string;
  enabled: boolean;
  created_at: string;
}

/** Row of the network_event_summary view (events per day per app per type). */
export interface NetworkEventSummaryRow {
  day: string;
  source_app: string;
  event_type: string;
  events: number;
}

/** Row of the network_superfan_scores view. */
export interface NetworkSuperfanScore {
  network_id: string;
  artist_slug: string | null;
  score: number;
  event_count: number;
}

/** Superfan score enriched with the hub fan's name/email, when resolvable. */
export interface SuperfanScoreWithFan extends NetworkSuperfanScore {
  hub_fan_id: string | null;
  fan_name: string | null;
  fan_email: string | null;
}
