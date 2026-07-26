export type NetworkEventType =
  | 'fan.joined' | 'member.joined' | 'points.awarded' | 'badge.earned'
  | 'event.rsvp' | 'event.checkin' | 'purchase.completed' | 'release.dropped'
  | 'sync.placement.landed' | 'venue.play.detected' | 'ad.attributed'
  | 'content.featured' | 'artist.stage.advanced' | 'tier.promoted'
  | 'referral.converted' | (string & {});

export interface NetworkEvent {
  event_type: NetworkEventType;
  local_actor_id?: string;
  actor_email?: string;
  artist_slug?: string;
  entity_type?: string;
  entity_id?: string;
  occurred_at?: string;       // ISO timestamp; defaults to now() server-side
  dedupe_key?: string;        // strongly recommended: '<app>:<kind>:<id>'
  metadata?: Record<string, unknown>;
}
