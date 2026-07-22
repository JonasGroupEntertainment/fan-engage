import type { NetworkEvent } from './types';
export type { NetworkEvent, NetworkEventType } from './types';

const HUB_URL = 'https://uhovonrljcauaoctypbg.supabase.co';
const INGEST = `${HUB_URL}/rest/v1/rpc/network_ingest_event`;

export interface NetworkClientConfig {
  /** Hub anon key (public). */
  anonKey: string;
  /** This app's publisher API key from network_publishers. Keep server-side. */
  publisherKey: string;
  fetchImpl?: typeof fetch;
}

/**
 * Emit a fan event into the Jonas Network hub.
 * Fire-and-forget safe: resolves to the event id, or null on failure (never throws).
 * Use from API routes / server components — the publisher key must not ship to browsers.
 */
export function createNetworkClient(cfg: NetworkClientConfig) {
  const f = cfg.fetchImpl ?? fetch;
  return {
    async emit(event: NetworkEvent): Promise<number | null> {
      try {
        const res = await f(INGEST, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: cfg.anonKey,
            Authorization: `Bearer ${cfg.anonKey}`,
          },
          body: JSON.stringify({ p_api_key: cfg.publisherKey, p_event: event }),
        });
        if (!res.ok) return null;
        return (await res.json()) as number | null;
      } catch {
        return null;
      }
    },
  };
}
