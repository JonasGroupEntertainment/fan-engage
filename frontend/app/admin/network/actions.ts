"use server";

import { getAdminUser } from "@/lib/admin";
import { getRecentFanEvents } from "@/lib/network/queries";
import type { FanEvent } from "@/lib/network/types";

/**
 * Poll for fan events newer than `sinceId`. The network tables have RLS
 * with no policies, so browser Realtime subscriptions receive nothing —
 * the live feed polls this action instead (service-role read, admin-gated).
 */
export async function fetchNewFanEvents(sinceId: number): Promise<FanEvent[]> {
  const admin = await getAdminUser();
  if (!admin) return [];
  return getRecentFanEvents(50, sinceId);
}
