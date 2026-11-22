import { createHash } from "node:crypto";

/**
 * The claim a Broadcast send writes before it sends anything: a campaigns
 * row whose description names the tier, the channel and a short
 * fingerprint of the whole message. An identical send inside the
 * duplicate window finds that row and is refused.
 *
 * When a send reaches nobody (the mail or text service is down), the
 * description is changed so it no longer matches, and the admin can try
 * again at once.
 *
 * Pure apart from node:crypto.
 */

const FINGERPRINT_LENGTH = 12;

export const NOTHING_SENT_SUFFIX = " · nothing sent";

function messageFingerprint(message: string): string {
  return createHash("sha256").update(message, "utf8").digest("hex").slice(0, FINGERPRINT_LENGTH);
}

export function broadcastClaimDescription(tier: string, channel: string, message: string): string {
  return `Tier: ${tier} · Channel: ${channel} · ref ${messageFingerprint(message)}`;
}

export function releasedClaimDescription(description: string): string {
  return `${description}${NOTHING_SENT_SUFFIX}`;
}
