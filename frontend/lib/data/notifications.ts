import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface Notification {
  id: string;
  fan_id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  icon: string | null;
  dedup_key: string | null;
  created_at: string;
  read_at: string | null;
}

/**
 * List the signed-in fan's notifications, newest first. Returns an empty list
 * if the user isn't signed in (matches the pattern elsewhere in lib/data/*).
 *
 * Reads via the admin client to avoid any RLS surprises during SSR; the
 * auth.getUser() check above guarantees we only return rows belonging to the
 * current user.
 */
export async function listNotifications(limit = 50): Promise<Notification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("notifications")
    .select("*")
    .eq("fan_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Notification[];
}

/**
 * Count unread notifications for the signed-in fan. Cheap — used by the
 * header badge on every RSC render.
 */
export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const admin = createAdminClient();
  const { count } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("fan_id", user.id)
    .is("read_at", null);
  return count ?? 0;
}

/**
 * Insert a notification row from server code. Used by server actions where
 * we don't have an obvious DB trigger to hang off (e.g. campaign broadcasts,
 * manual admin actions).
 *
 * Dedup is enforced by the unique index on (fan_id, dedup_key); we catch
 * duplicate-key errors and no-op.
 *
 * `communityId` is required so every caller has to decide. Pass the artist
 * community the notice is about, or null when it is not about one community
 * (a platform notice). Leaving it out used to file the row under 'raelynn'
 * through a database default (dropped by migration 0100).
 */
export async function createNotification(params: {
  fanId: string;
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  icon?: string | null;
  dedupKey?: string | null;
  communityId: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("notifications").insert({
    fan_id: params.fanId,
    kind: params.kind,
    title: params.title,
    body: params.body ?? null,
    url: params.url ?? null,
    icon: params.icon ?? null,
    dedup_key: params.dedupKey ?? null,
    community_id: params.communityId,
  });
  // 23505 = unique_violation — dedup key already exists, silently skip
  if (error && error.code !== "23505") {
    console.warn("createNotification failed:", error.message);
  }
}
