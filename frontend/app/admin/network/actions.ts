"use server";

import { authorizeAdmin } from "@/lib/admin-guard";
import { getRecentFanEvents } from "@/lib/network/queries";
import type { FanEvent } from "@/lib/network/types";

/**
 * Poll for fan events newer than `sinceId`. The network tables have RLS
 * with no policies, so browser Realtime subscriptions receive nothing —
 * the live feed polls this action instead (service-role read, admin-gated).
 */
export async function fetchNewFanEvents(sinceId: number): Promise<FanEvent[]> {
  // Same gate as the page: cross-community data is super-admin only.
  const guard = await authorizeAdmin({ superAdminOnly: true });
  if (!guard.ok) return [];
  return getRecentFanEvents(50, sinceId);
}
