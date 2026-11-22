// Database side of sending announcements to social: the artist's linked
// accounts, the daily limit count, and the audit rows (migration 0104).
// Service role only, and server only: this is the one place the Blotato
// client is built with the real key.
//
// Until 0104 is applied the tables do not exist. A failed read is treated
// as "no accounts linked", so the app behaves exactly as it did before.
import "server-only";
import { createAdminClient } from "../supabase/admin.ts";
import { resolveAppUrl } from "../app-url.ts";
import { createBlotatoPublisher } from "../social/blotato.ts";
import type { SocialDeps, SocialPostRecord } from "../social/announce.ts";
import {
  isSocialPostingConfigured,
  offerablePlatforms,
  parseSocialOutcomeRows,
  parseSocialAccountRows,
  storageHostFromEnv,
  type SocialAccount,
  type SocialOutcome,
  type SocialPlatform,
} from "../social/social-post.ts";

const ACCOUNTS_TABLE = "artist_social_accounts";
const POSTS_TABLE = "artist_social_posts";
/** Postgres and PostgREST codes for "this table does not exist". */
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
/**
 * Statuses that count toward the daily limit: anything sent, tried, or
 * still pending. A row left pending by a function that stopped part way
 * keeps counting, which is the safe direction.
 */
const COUNTED_STATUSES = ["pending", "sent", "failed"];

type DbError = { code?: string; message?: string } | null;

function logUnlessMissingTable(what: string, error: DbError): void {
  if (!error || MISSING_TABLE_CODES.has(error.code ?? "")) return;
  console.error(`${what} failed`, error.message ?? error.code ?? "unknown error");
}

/** Active linked accounts for an artist. Empty when none, or when the table is missing. */
export async function listActiveSocialAccounts(artistSlug: string): Promise<SocialAccount[]> {
  const { data, error } = await createAdminClient()
    .from(ACCOUNTS_TABLE)
    .select("platform, blotato_account_id, page_id")
    .eq("artist_slug", artistSlug)
    .eq("active", true);
  if (error) {
    logUnlessMissingTable("social accounts read", error);
    return [];
  }
  return parseSocialAccountRows(data);
}

/**
 * How many different announcements this artist has sent to social since
 * `sinceIso`. Null when it cannot be counted, so the caller sends nothing.
 */
export async function countRecentSocialAnnouncements(
  artistSlug: string,
  sinceIso: string,
): Promise<number | null> {
  const { data, error } = await createAdminClient()
    .from(POSTS_TABLE)
    .select("community_post_id")
    .eq("artist_slug", artistSlug)
    .in("status", COUNTED_STATUSES)
    .gte("created_at", sinceIso);
  if (error || !Array.isArray(data)) {
    console.error("social post count failed", error?.message ?? "no rows returned");
    return null;
  }
  return new Set(data.map((row) => String(row.community_post_id))).size;
}

/**
 * Rows already written for this artist and submit key. Empty on a first
 * attempt. Null when it cannot be read, so the caller sends nothing.
 */
export async function findSocialPostsBySubmitKey(
  artistSlug: string,
  submitKey: string,
): Promise<SocialOutcome[] | null> {
  const { data, error } = await createAdminClient()
    .from(POSTS_TABLE)
    .select("platform, status, provider_ref, detail")
    .eq("artist_slug", artistSlug)
    .eq("submit_key", submitKey);
  if (error || !Array.isArray(data)) {
    console.error("social post submit key lookup failed", error?.message ?? "no rows returned");
    return null;
  }
  return parseSocialOutcomeRows(data);
}

/** Write the audit rows before anything is sent. Throws when they cannot be written. */
export async function reserveSocialPosts(rows: SocialPostRecord[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await createAdminClient()
    .from(POSTS_TABLE)
    .insert(
      rows.map((row) => ({
        artist_slug: row.artistSlug,
        community_post_id: row.communityPostId,
        platform: row.platform,
        status: row.status,
        provider_ref: row.providerRef,
        detail: row.detail,
        created_by: row.createdBy,
        submit_key: row.submitKey,
      })),
    );
  if (error) throw new Error(error.message);
}

async function settleSocialPost(row: SocialPostRecord): Promise<string | null> {
  const { error } = await createAdminClient()
    .from(POSTS_TABLE)
    .update({ status: row.status, provider_ref: row.providerRef, detail: row.detail })
    .eq("community_post_id", row.communityPostId)
    .eq("platform", row.platform);
  return error ? error.message : null;
}

/** Update each pending row with what happened. Throws if any update fails. */
export async function settleSocialPosts(rows: SocialPostRecord[]): Promise<void> {
  const errors = (await Promise.all(rows.map(settleSocialPost))).filter((message) => message !== null);
  if (errors.length > 0) throw new Error(errors.join("; "));
}

/**
 * Platforms to name on the announcement form's checkbox. Empty (so the
 * checkbox is not shown) when the feature is off, no key is set, nothing
 * is linked, or the lookup fails.
 */
export async function getOfferableSocialPlatforms(artistSlug: string): Promise<SocialPlatform[]> {
  if (!isSocialPostingConfigured(process.env)) return [];
  try {
    return offerablePlatforms(await listActiveSocialAccounts(artistSlug));
  } catch (err) {
    console.error("social platforms lookup failed", err instanceof Error ? err.message : err);
    return [];
  }
}

/** The real dependencies for sendAnnouncementToSocial. */
export function defaultSocialDeps(): SocialDeps {
  return {
    env: process.env,
    baseUrl: resolveAppUrl(),
    storageHost: storageHostFromEnv(process.env),
    now: () => new Date(),
    listAccounts: listActiveSocialAccounts,
    countRecentAnnouncements: countRecentSocialAnnouncements,
    findBySubmitKey: findSocialPostsBySubmitKey,
    reserve: reserveSocialPosts,
    settle: settleSocialPosts,
    createPublisher: (apiKey) => createBlotatoPublisher({ apiKey }),
  };
}
