import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  AI_FEATURES,
  resolveAiGate,
  type AiFeatureKey,
  type AiGateResolution,
} from "./core";

/**
 * Read side of the AI feature gates. One `ai_feature_gates` read per
 * (feature, community) per request (React.cache), service-role so the
 * lookup is the same from API routes, server actions and pages. A missing
 * table (0091 not applied) or any read error falls through to the env
 * fallback — the gate never fails closed on infrastructure.
 */
const readGateRow = cache(async function readGateRow(
  feature: AiFeatureKey,
  communityId: string,
): Promise<boolean | null> {
  try {
    const { data, error } = await createAdminClient()
      .from("ai_feature_gates")
      .select("enabled")
      .eq("feature", feature)
      .eq("community_id", communityId)
      .maybeSingle();
    if (error || !data) return null;
    return Boolean(data.enabled);
  } catch {
    return null;
  }
});

export async function resolveFeatureGateForCommunity(
  feature: AiFeatureKey,
  communityId: string | null | undefined,
): Promise<AiGateResolution> {
  const slug = (communityId ?? "").trim().toLowerCase();
  if (!slug) return { enabled: false, source: "off", envEnabled: false };
  const row = await readGateRow(feature, slug);
  return resolveAiGate(feature, slug, row);
}

/** row > env > off. */
export async function isFeatureEnabledForCommunity(
  feature: AiFeatureKey,
  communityId: string | null | undefined,
): Promise<boolean> {
  return (await resolveFeatureGateForCommunity(feature, communityId)).enabled;
}

export interface AiGateMatrixRow {
  communityId: string;
  displayName: string;
  gates: Record<AiFeatureKey, AiGateResolution & { updatedAt: string | null }>;
}

/** Every active community × every feature, for /admin/ai-gates. */
export async function listAiGateMatrix(): Promise<AiGateMatrixRow[]> {
  const admin = createAdminClient();
  const { data: communities } = await admin
    .from("communities")
    .select("slug, display_name, active")
    .eq("active", true)
    .order("sort_order")
    .order("slug");
  const rows = new Map<string, { enabled: boolean; updated_at: string | null }>();
  try {
    const { data } = await admin
      .from("ai_feature_gates")
      .select("feature, community_id, enabled, updated_at");
    for (const r of data ?? []) {
      rows.set(`${r.feature}:${r.community_id}`, {
        enabled: Boolean(r.enabled),
        updated_at: (r.updated_at as string | null) ?? null,
      });
    }
  } catch {
    // Table missing (0091 pending) — env-only view.
  }
  return (communities ?? []).map((c) => {
    const slug = c.slug as string;
    const gates = {} as AiGateMatrixRow["gates"];
    for (const f of AI_FEATURES) {
      const row = rows.get(`${f.key}:${slug}`);
      gates[f.key] = {
        ...resolveAiGate(f.key, slug, row?.enabled ?? null),
        updatedAt: row?.updated_at ?? null,
      };
    }
    return { communityId: slug, displayName: (c.display_name as string) ?? slug, gates };
  });
}
