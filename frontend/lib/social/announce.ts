// Sends one team announcement to the artist's linked Facebook Page and
// Instagram. The audit rows are written as "pending" before anything is
// sent, then updated with what happened, so the daily limit holds even if
// a write fails or the function stops part way. Called only from
// createAnnouncementAction, after the announcement is already saved, so a
// slow or failed send can never block or fail the announcement.
//
// Everything it needs is passed in (accounts, limit count, publisher,
// recorder), so tests run with no network and no database. It never throws.
import type { PublishResult, SocialPublisher } from "./blotato.ts";
import {
  SOCIAL_DAILY_LIMIT_MESSAGE,
  SOCIAL_DUPLICATE_UNKNOWN_MESSAGE,
  SOCIAL_LIMIT_UNKNOWN_MESSAGE,
  SOCIAL_NOT_ALLOWED_MESSAGE,
  SOCIAL_NOT_RECORDED_MESSAGE,
  SOCIAL_NO_SUBMIT_KEY_MESSAGE,
  SOCIAL_NOT_SET_UP_MESSAGE,
  SOCIAL_UNEXPECTED_MESSAGE,
  decideSocialEligibility,
  isOverDailyLimit,
  isSocialPostingConfigured,
  isValidSubmitKey,
  planSocialPosts,
  socialLimitWindowStartIso,
  summarizeSocialOutcomes,
  type SocialAccount,
  type SocialOutcome,
  type SocialPlanItem,
} from "./social-post.ts";

/** Only the announcement's own words and image. No author, no fan data. */
export type AnnouncementForSocial = {
  kind: "announcement";
  communityPostId: string;
  artistSlug: string;
  title: string;
  body: string;
  visibility: string;
  imageUrl: string | null;
  /** The team member who ticked the box. Kept for the audit trail only. */
  createdBy: string;
  /**
   * Result of the server side check that this person may publish an
   * announcement for this artist (the same rule the announcement uses).
   */
  isArtistAdmin: boolean;
  /** One fresh uuid per form submit. A retry carries the same key. */
  submitKey: string;
};

export type SocialPostRecord = SocialOutcome & {
  artistSlug: string;
  communityPostId: string;
  createdBy: string;
  submitKey: string;
};

export type SocialDeps = {
  env: Record<string, string | undefined>;
  baseUrl: string;
  /** Host of the app's own Supabase storage, for the image check. */
  storageHost: string | null;
  now: () => Date;
  listAccounts: (artistSlug: string) => Promise<SocialAccount[]>;
  /** Announcements already sent or pending in the window, or null when it cannot be counted. */
  countRecentAnnouncements: (artistSlug: string, sinceIso: string) => Promise<number | null>;
  /**
   * Rows already written for this artist and submit key. Empty when this is
   * the first attempt, null when it cannot be checked.
   */
  findBySubmitKey: (artistSlug: string, submitKey: string) => Promise<SocialOutcome[] | null>;
  /** Write the rows before sending. Must throw when they cannot be written. */
  reserve: (rows: SocialPostRecord[]) => Promise<void>;
  /** Update the pending rows with what happened. */
  settle: (rows: SocialPostRecord[]) => Promise<void>;
  createPublisher: (apiKey: string) => SocialPublisher;
};

export type SocialNotice = { message: string; outcomes: SocialOutcome[] };

const notSent = (message: string): SocialNotice => ({ message, outcomes: [] });

async function publishSafely(publisher: SocialPublisher, item: SocialPlanItem & { action: "send" }): Promise<PublishResult> {
  try {
    return await publisher.publish(item.request);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.name : "Request failed" };
  }
}

async function carryOut(publisher: SocialPublisher, item: SocialPlanItem): Promise<SocialOutcome> {
  const { platform } = item;
  if (item.action === "skip") {
    return { platform, status: "skipped", providerRef: null, detail: item.reason };
  }
  const result = await publishSafely(publisher, item);
  return result.ok
    ? { platform, status: "sent", providerRef: result.providerRef, detail: null }
    : { platform, status: "failed", providerRef: null, detail: result.error };
}

/** The row written before the send: pending, or skipped when nothing will be sent. */
function rowBeforeSend(item: SocialPlanItem): SocialOutcome {
  const { platform } = item;
  return item.action === "skip"
    ? { platform, status: "skipped", providerRef: null, detail: item.reason }
    : { platform, status: "pending", providerRef: null, detail: null };
}

async function reserveSafely(deps: SocialDeps, rows: SocialPostRecord[]): Promise<boolean> {
  try {
    await deps.reserve(rows);
    return true;
  } catch (err) {
    console.error("social post audit write failed", err instanceof Error ? err.message : err);
    return false;
  }
}

/** A row that cannot be settled stays pending, which still counts toward the limit. */
async function settleSafely(deps: SocialDeps, rows: SocialPostRecord[]): Promise<void> {
  try {
    await deps.settle(rows);
  } catch (err) {
    console.error("social post audit update failed", err instanceof Error ? err.message : err);
  }
}

/** Why nothing may be sent, or null when the announcement and settings allow it. */
function refusalMessage(announcement: AnnouncementForSocial, deps: SocialDeps): string | null {
  if (!announcement.isArtistAdmin) return SOCIAL_NOT_ALLOWED_MESSAGE;
  const eligibility = decideSocialEligibility(announcement);
  if (!eligibility.ok) return eligibility.message;
  if (!isSocialPostingConfigured(deps.env)) return SOCIAL_NOT_SET_UP_MESSAGE;
  if (!isValidSubmitKey(announcement.submitKey)) return SOCIAL_NO_SUBMIT_KEY_MESSAGE;
  return null;
}

async function sendChecked(announcement: AnnouncementForSocial, deps: SocialDeps): Promise<SocialNotice> {
  const refusal = refusalMessage(announcement, deps);
  if (refusal !== null) return notSent(refusal);
  const { artistSlug, submitKey } = announcement;

  const accounts = await deps.listAccounts(artistSlug);
  if (accounts.length === 0) return notSent(SOCIAL_NOT_SET_UP_MESSAGE);

  // A retry of the same submit carries the same key: send nothing again and
  // report what the first attempt did.
  const earlier = await deps.findBySubmitKey(artistSlug, submitKey);
  if (earlier === null) return notSent(SOCIAL_DUPLICATE_UNKNOWN_MESSAGE);
  if (earlier.length > 0) return { message: summarizeSocialOutcomes(earlier), outcomes: earlier };

  const sinceIso = socialLimitWindowStartIso(deps.now());
  const recent = await deps.countRecentAnnouncements(artistSlug, sinceIso);
  if (recent === null) return notSent(SOCIAL_LIMIT_UNKNOWN_MESSAGE);
  if (isOverDailyLimit(recent)) return notSent(SOCIAL_DAILY_LIMIT_MESSAGE);

  const plan = planSocialPosts({
    accounts,
    title: announcement.title,
    body: announcement.body,
    imageUrl: announcement.imageUrl,
    storageHost: deps.storageHost,
    artistSlug,
    baseUrl: deps.baseUrl,
  });
  const toRecord = (outcome: SocialOutcome): SocialPostRecord => ({
    ...outcome,
    artistSlug,
    communityPostId: announcement.communityPostId,
    createdBy: announcement.createdBy,
    submitKey,
  });

  const isReserved = await reserveSafely(deps, plan.map((item) => toRecord(rowBeforeSend(item))));
  if (!isReserved) return notSent(SOCIAL_NOT_RECORDED_MESSAGE);

  const publisher = deps.createPublisher(deps.env.BLOTATO_API_KEY ?? "");
  const outcomes = await Promise.all(plan.map((item) => carryOut(publisher, item)));
  const attempted = outcomes.filter((outcome) => outcome.status !== "skipped");
  await settleSafely(deps, attempted.map(toRecord));
  return { message: summarizeSocialOutcomes(outcomes), outcomes };
}

/**
 * Send a saved team announcement to social. Returns one plain line for the
 * team member saying where it went and what was skipped. Never throws.
 */
export async function sendAnnouncementToSocial(
  announcement: AnnouncementForSocial,
  deps: SocialDeps,
): Promise<SocialNotice> {
  try {
    return await sendChecked(announcement, deps);
  } catch (err) {
    console.error("social announcement send failed", err instanceof Error ? err.message : err);
    return notSent(SOCIAL_UNEXPECTED_MESSAGE);
  }
}
