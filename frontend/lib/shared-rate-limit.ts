import { createHash } from "node:crypto";

export type SharedRateLimitInput = {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  salt: string;
};

export type SharedRateLimitRpcArgs = {
  p_scope: string;
  p_identifier_hash: string;
  p_limit: number;
  p_window_seconds: number;
};

type SharedRateLimitRpcRow = {
  allowed: boolean;
  remaining: number;
  reset_at: string;
};

export type SharedRateLimitDecision =
  | { allowed: true; remaining: number; resetAt: string }
  | { allowed: false; reason: "exhausted"; remaining: number; resetAt: string }
  | { allowed: false; reason: "backend_unavailable" };

type ConsumeRateLimit = (
  args: SharedRateLimitRpcArgs,
) => Promise<SharedRateLimitRpcRow | SharedRateLimitRpcRow[]>;

export function hashRateLimitIdentifier(identifier: string, salt: string): string {
  if (!salt.trim()) throw new Error("rate-limit hash salt is required");
  return createHash("sha256").update(salt).update("\0").update(identifier).digest("hex");
}

async function consumeViaSupabase(
  args: SharedRateLimitRpcArgs,
): Promise<SharedRateLimitRpcRow | SharedRateLimitRpcRow[]> {
  const { createAdminClient } = await import("./supabase/admin.ts");
  const { data, error } = await createAdminClient().rpc("consume_rate_limit", args);
  if (error) throw error;
  return data as SharedRateLimitRpcRow | SharedRateLimitRpcRow[];
}

function isRpcRow(value: unknown): value is SharedRateLimitRpcRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SharedRateLimitRpcRow>;
  return (
    typeof row.allowed === "boolean" &&
    Number.isInteger(row.remaining) &&
    typeof row.reset_at === "string" &&
    row.reset_at.length > 0
  );
}

export async function checkSharedRateLimit(
  input: SharedRateLimitInput,
  consume: ConsumeRateLimit = consumeViaSupabase,
): Promise<SharedRateLimitDecision> {
  if (!Number.isInteger(input.limit) || input.limit <= 0) {
    throw new Error("limit must be a positive integer");
  }
  if (!Number.isInteger(input.windowSeconds) || input.windowSeconds <= 0) {
    throw new Error("windowSeconds must be a positive integer");
  }

  const args: SharedRateLimitRpcArgs = {
    p_scope: input.scope,
    p_identifier_hash: hashRateLimitIdentifier(input.identifier, input.salt),
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds,
  };

  try {
    const result = await consume(args);
    const row = Array.isArray(result) ? result[0] : result;
    if (!isRpcRow(row)) return { allowed: false, reason: "backend_unavailable" };
    if (!row.allowed) {
      return {
        allowed: false,
        reason: "exhausted",
        remaining: row.remaining,
        resetAt: row.reset_at,
      };
    }
    return { allowed: true, remaining: row.remaining, resetAt: row.reset_at };
  } catch {
    return { allowed: false, reason: "backend_unavailable" };
  }
}
