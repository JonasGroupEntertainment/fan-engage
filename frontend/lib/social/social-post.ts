// Rules and wording for sending a team announcement to an artist's own
// Facebook Page and Instagram. Pure: no network, no database, and no "@/"
// imports, so plain `node --test` can load it.
//
// Only team announcements may ever go out. Fan posts, comments, polls
// and challenge entries are refused here and have no sender of their own.
//
// Ported from Brand Engage Pro, with the same guard rails.
import { mentionsAlcohol } from "./alcohol-terms.ts";

export const SOCIAL_PLATFORMS = ["facebook", "instagram"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
};

/**
 * Longest text each platform accepts. These are the platforms' own caption
 * limits (Facebook post text, Instagram caption). Blotato's docs do not
 * list them, so they are kept here in one place.
 */
export const PLATFORM_TEXT_LIMITS: Record<SocialPlatform, number> = {
  facebook: 63206,
  instagram: 2200,
};

/** Most announcements one artist may send to social in a day. */
export const MAX_SOCIAL_ANNOUNCEMENTS_PER_ARTIST_PER_DAY = 3;
const DAILY_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The on/off setting must hold exactly this value. */
export const SOCIAL_POSTING_ENABLED_VALUE = "1";

/** Form field for the "also post" checkbox, and the value it sends. */
export const ALSO_POST_FIELD = "also_post_to_social";
export const ALSO_POST_VALUE = "1";

/**
 * Form field holding one fresh key per submit. Every post form sends it:
 * a retry of the same submit cannot save the post twice
 * (lib/community/save-once.ts) and cannot send to social twice.
 */
export const SUBMIT_KEY_FIELD = "social_submit_key";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only images on the app's own public Supabase storage go out as media. */
const PUBLIC_STORAGE_PATH_PREFIX = "/storage/v1/object/public/";

export const ELLIPSIS = "...";
const JOIN_LINE_PREFIX = "Join the community free: ";
const PARAGRAPH_BREAK = "\n\n";
const ANNOUNCEMENT_KIND = "announcement";
const PUBLIC_VISIBILITY = "public";

type EnvLike = Record<string, string | undefined>;

/** True only when the switch is "1" and a Blotato key is present. */
export function isSocialPostingConfigured(env: EnvLike): boolean {
  const isSwitchedOn = env.SOCIAL_POSTING_ENABLED === SOCIAL_POSTING_ENABLED_VALUE;
  const hasKey = (env.BLOTATO_API_KEY ?? "").trim().length > 0;
  return isSwitchedOn && hasKey;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  shy: "",
  zwnj: "",
  zwj: "",
  ndash: "\u2013",
  mdash: "-",
  hellip: "...",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  eacute: "\u00e9",
  Eacute: "\u00c9",
  egrave: "\u00e8",
  ntilde: "\u00f1",
  deg: "\u00b0",
};
const MAX_CODE_POINT = 0x10ffff;
/** Zero width characters and the soft hyphen: invisible, so they are dropped. */
const INVISIBLE_CHARACTERS = /[\u00ad\u200b-\u200d\u2060\ufeff]/g;

function decodeCodePoint(codePoint: number, original: string): string {
  const isValid = Number.isInteger(codePoint) && codePoint > 0 && codePoint <= MAX_CODE_POINT;
  const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
  return isValid && !isSurrogate ? String.fromCodePoint(codePoint) : original;
}

/** Decodes numeric (&#105; &#x69;) and common named (&amp;) HTML entities, once. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (original, name: string) => {
    if (/^#x/i.test(name)) return decodeCodePoint(Number.parseInt(name.slice(2), 16), original);
    if (name.startsWith("#")) return decodeCodePoint(Number.parseInt(name.slice(1), 10), original);
    return Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : original;
  });
}

/** Plain text from text that may hold HTML or Markdown markup. */
export function toPlainText(raw: string): string {
  const withoutTags = raw
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, PARAGRAPH_BREAK)
    .replace(/<\/?[a-zA-Z][^>]*>/g, "");
  const withoutMarkdown = withoutTags
    .replace(/!?\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s).,!?:;])/gm, "$1$2");
  return decodeEntities(withoutMarkdown)
    .replace(INVISIBLE_CHARACTERS, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, PARAGRAPH_BREAK)
    .trim();
}

/** True for a uuid, the shape the form's per submit key must have. */
export function isValidSubmitKey(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Host of the app's own Supabase project, from NEXT_PUBLIC_SUPABASE_URL. */
export function storageHostFromEnv(env: EnvLike): string | null {
  try {
    const url = new URL((env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim());
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * The image to send as media, or null. Only an https address on the app's
 * own Supabase storage, under the public object path, is allowed. Anything
 * else is treated as no image, so a third party never fetches an address
 * a person typed in.
 */
export function socialImageUrl(
  imageUrl: string | null | undefined,
  storageHost: string | null | undefined,
): string | null {
  const host = (storageHost ?? "").trim().toLowerCase();
  if (!host || !imageUrl) return null;
  try {
    const url = new URL(imageUrl.trim());
    const isOwnStorage =
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === host &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.startsWith(PUBLIC_STORAGE_PATH_PREFIX);
    return isOwnStorage ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * "Join the community free: https://www.fanengagepro.com/signup?artist=<slug>"
 * The sign-up page reads ?artist=<slug> and opens with that artist.
 */
export function buildJoinLine(artistSlug: string, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${JOIN_LINE_PREFIX}${base}/signup?artist=${encodeURIComponent(artistSlug)}`;
}

/** Cut text to `room` characters at a word break, without splitting an emoji. */
function truncateAtWord(text: string, room: number): string {
  if (room <= 0) return "";
  const cut = text.slice(0, room);
  const lastBreak = cut.search(/\s\S*$/);
  const atWord = lastBreak > room / 2 ? cut.slice(0, lastBreak) : cut;
  return atWord.replace(/[\uD800-\uDBFF]$/, "").trimEnd();
}

/**
 * Title and body as plain text, a blank line, then the join line. When the
 * whole thing is over `limit`, the title and body are shortened. The join
 * line is never cut.
 */
export function buildSocialText(input: {
  title: string;
  body: string;
  joinLine: string;
  limit: number;
}): string {
  const head = [toPlainText(input.title), toPlainText(input.body)]
    .filter((part) => part.length > 0)
    .join(PARAGRAPH_BREAK);
  const tail = `${PARAGRAPH_BREAK}${input.joinLine}`;
  if (head.length + tail.length <= input.limit) return `${head}${tail}`;
  const room = input.limit - tail.length - ELLIPSIS.length;
  return `${truncateAtWord(head, room)}${ELLIPSIS}${tail}`;
}

export type SocialRefusalReason = "not_announcement" | "premium_or_founders" | "age_21";

export type SocialEligibility =
  | { ok: true }
  | { ok: false; reason: SocialRefusalReason; message: string };

export const SOCIAL_REFUSAL_MESSAGES: Record<SocialRefusalReason, string> = {
  not_announcement: "Only team announcements can go to Facebook and Instagram.",
  premium_or_founders:
    "Premium and Founders announcements stay inside the community, so this was not sent to Facebook or Instagram.",
  age_21:
    "This announcement mentions alcohol or tobacco, so it was not sent to Facebook or Instagram. It is still posted in the community.",
};

/** Shown on the form in place of the checkbox when the wording mentions alcohol or tobacco. */
export const SOCIAL_AGE_21_FORM_NOTE =
  "This announcement mentions alcohol or tobacco, so it cannot go to Facebook or Instagram.";

/** Shown on the form when Instagram is linked but no photo is attached yet. */
export const SOCIAL_NO_PHOTO_FORM_NOTE =
  "Instagram needs a photo. Without one, this will not go to Instagram.";

/** True when the wording, as typed or as sent, mentions alcohol or tobacco. */
export function isAge21Content(title: string, body: string): boolean {
  // Checked on the words as typed and on the plain text that would really
  // be sent, so markup or entities cannot hide a word from the check.
  const asTyped = `${title} ${body}`;
  const asSent = `${toPlainText(title)} ${toPlainText(body)}`;
  return mentionsAlcohol(asTyped) || mentionsAlcohol(asSent);
}

/**
 * May this go to social at all? Only a public team announcement with no
 * alcohol or tobacco wording. Anything that is not exactly "public"
 * (Premium, Founders, or a value this code does not know) is refused.
 */
export function decideSocialEligibility(input: {
  kind: string;
  visibility: string;
  title: string;
  body: string;
}): SocialEligibility {
  const refuse = (reason: SocialRefusalReason): SocialEligibility => ({
    ok: false,
    reason,
    message: SOCIAL_REFUSAL_MESSAGES[reason],
  });
  if (input.kind !== ANNOUNCEMENT_KIND) return refuse("not_announcement");
  if (input.visibility !== PUBLIC_VISIBILITY) return refuse("premium_or_founders");
  if (isAge21Content(input.title, input.body)) return refuse("age_21");
  return { ok: true };
}

export type SocialAccount = {
  platform: SocialPlatform;
  blotatoAccountId: string;
  /** Facebook Page id. Not used for Instagram. */
  pageId: string | null;
};

function isSocialPlatform(value: unknown): value is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly unknown[]).includes(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Validates artist_social_accounts rows. Anything malformed is dropped. */
export function parseSocialAccountRows(rows: unknown): SocialAccount[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): SocialAccount[] => {
    if (typeof row !== "object" || row === null) return [];
    const record = row as Record<string, unknown>;
    const blotatoAccountId = cleanText(record.blotato_account_id);
    if (!isSocialPlatform(record.platform) || !blotatoAccountId) return [];
    return [{ platform: record.platform, blotatoAccountId, pageId: cleanText(record.page_id) || null }];
  });
}

function isSendable(account: SocialAccount): boolean {
  return account.platform !== "facebook" || account.pageId !== null;
}

/** One account per platform, Facebook first. */
function accountsInOrder(accounts: readonly SocialAccount[]): SocialAccount[] {
  return SOCIAL_PLATFORMS.flatMap((platform) => {
    const match = accounts.find((account) => account.platform === platform);
    return match ? [match] : [];
  });
}

/** Platforms this artist can really send to, for the checkbox wording. */
export function offerablePlatforms(accounts: readonly SocialAccount[]): SocialPlatform[] {
  return accountsInOrder(accounts)
    .filter(isSendable)
    .map((account) => account.platform);
}

/** "Facebook and Instagram", or just the one. */
export function describePlatforms(platforms: readonly SocialPlatform[]): string {
  return platforms.map((platform) => PLATFORM_LABELS[platform]).join(" and ");
}

/** The checkbox label on the announcement form. */
export function alsoPostLabel(artistName: string, platforms: readonly SocialPlatform[]): string {
  return `Also post this to ${artistName}'s ${describePlatforms(platforms)}`;
}

export type SocialSendRequest = {
  platform: SocialPlatform;
  accountId: string;
  pageId: string | null;
  text: string;
  mediaUrls: string[];
};

export type SocialSkipReason = "no_image" | "no_page";

export type SocialPlanItem =
  | { platform: SocialPlatform; action: "send"; request: SocialSendRequest }
  | { platform: SocialPlatform; action: "skip"; reason: SocialSkipReason };

/**
 * What to send where. Instagram cannot take a post with no image, so it is
 * skipped when there is none. Facebook is skipped when no Page id is on file.
 */
export function planSocialPosts(input: {
  accounts: readonly SocialAccount[];
  title: string;
  body: string;
  imageUrl: string | null;
  /** Host of the app's own Supabase storage. Images elsewhere are not sent. */
  storageHost: string | null;
  artistSlug: string;
  baseUrl: string;
}): SocialPlanItem[] {
  const joinLine = buildJoinLine(input.artistSlug, input.baseUrl);
  const imageUrl = socialImageUrl(input.imageUrl, input.storageHost);
  return accountsInOrder(input.accounts).map((account): SocialPlanItem => {
    const { platform } = account;
    if (!isSendable(account)) return { platform, action: "skip", reason: "no_page" };
    if (platform === "instagram" && !imageUrl) return { platform, action: "skip", reason: "no_image" };
    const text = buildSocialText({
      title: input.title,
      body: input.body,
      joinLine,
      limit: PLATFORM_TEXT_LIMITS[platform],
    });
    return {
      platform,
      action: "send",
      request: {
        platform,
        accountId: account.blotatoAccountId,
        pageId: account.pageId,
        text,
        mediaUrls: imageUrl ? [imageUrl] : [],
      },
    };
  });
}

export function isOverDailyLimit(recentAnnouncements: number): boolean {
  return recentAnnouncements >= MAX_SOCIAL_ANNOUNCEMENTS_PER_ARTIST_PER_DAY;
}

/** Start of the daily limit window: one day before `now`. */
export function socialLimitWindowStartIso(now: Date): string {
  return new Date(now.getTime() - DAILY_LIMIT_WINDOW_MS).toISOString();
}

/** "pending" is written before the send and replaced once it finishes. */
export type SocialOutcomeStatus = "pending" | "sent" | "skipped" | "failed";

export type SocialOutcome = {
  platform: SocialPlatform;
  status: SocialOutcomeStatus;
  providerRef: string | null;
  /** Skip reason code, or the provider's error for the audit trail. */
  detail: string | null;
};

const OUTCOME_STATUSES: readonly SocialOutcomeStatus[] = ["pending", "sent", "skipped", "failed"];

function isOutcomeStatus(value: unknown): value is SocialOutcomeStatus {
  return (OUTCOME_STATUSES as readonly unknown[]).includes(value);
}

/** Validates artist_social_posts rows. Anything malformed is dropped. */
export function parseSocialOutcomeRows(rows: unknown): SocialOutcome[] {
  if (!Array.isArray(rows)) return [];
  const parsed = rows.flatMap((row): SocialOutcome[] => {
    if (typeof row !== "object" || row === null) return [];
    const record = row as Record<string, unknown>;
    if (!isSocialPlatform(record.platform) || !isOutcomeStatus(record.status)) return [];
    return [
      {
        platform: record.platform,
        status: record.status,
        providerRef: cleanText(record.provider_ref) || null,
        detail: cleanText(record.detail) || null,
      },
    ];
  });
  return SOCIAL_PLATFORMS.flatMap((platform) => parsed.filter((outcome) => outcome.platform === platform));
}

const SKIP_EXPLANATIONS: Record<SocialSkipReason, string> = {
  no_image: "it needs a photo and this announcement has none",
  no_page: "its Page is not set up yet",
};
const UNKNOWN_SKIP_EXPLANATION = "it is not set up yet";
const STILL_POSTED = "Your announcement is still posted in the community.";

export const SOCIAL_NOT_SET_UP_MESSAGE =
  "Posting to Facebook and Instagram is not set up for this artist yet, so this was not sent there.";
export const SOCIAL_DAILY_LIMIT_MESSAGE = `This artist has reached the limit of ${MAX_SOCIAL_ANNOUNCEMENTS_PER_ARTIST_PER_DAY} social posts in a day, so this was not sent to Facebook or Instagram. ${STILL_POSTED}`;
export const SOCIAL_LIMIT_UNKNOWN_MESSAGE = `We could not check today's social post limit, so this was not sent to Facebook or Instagram. ${STILL_POSTED}`;
export const SOCIAL_NO_SUBMIT_KEY_MESSAGE = `We could not confirm this was a single request, so it was not sent to Facebook or Instagram. ${STILL_POSTED}`;
export const SOCIAL_DUPLICATE_UNKNOWN_MESSAGE = `We could not check whether this was already sent, so it was not sent to Facebook or Instagram. ${STILL_POSTED}`;
export const SOCIAL_NOT_RECORDED_MESSAGE = `We could not record this send, so nothing was sent to Facebook or Instagram. ${STILL_POSTED}`;
export const SOCIAL_NOT_ALLOWED_MESSAGE = "Only this artist's team can post to their Facebook and Instagram.";
export const SOCIAL_UNEXPECTED_MESSAGE = `We could not send this to Facebook or Instagram. ${STILL_POSTED}`;

function skipExplanation(detail: string | null): string {
  return detail !== null && detail in SKIP_EXPLANATIONS
    ? SKIP_EXPLANATIONS[detail as SocialSkipReason]
    : UNKNOWN_SKIP_EXPLANATION;
}

function platformsWithStatus(outcomes: readonly SocialOutcome[], status: SocialOutcomeStatus): SocialPlatform[] {
  return outcomes.filter((outcome) => outcome.status === status).map((outcome) => outcome.platform);
}

/** One plain line for the team member: where it went, what was skipped and why. */
export function summarizeSocialOutcomes(outcomes: readonly SocialOutcome[]): string {
  const sent = platformsWithStatus(outcomes, "sent");
  const failed = platformsWithStatus(outcomes, "failed");
  const pending = platformsWithStatus(outcomes, "pending");
  const sentLine = sent.length > 0 ? [`Sent to ${describePlatforms(sent)}.`] : [];
  const skippedLines = outcomes
    .filter((outcome) => outcome.status === "skipped")
    .map((outcome) => `${PLATFORM_LABELS[outcome.platform]} was skipped because ${skipExplanation(outcome.detail)}.`);
  const failedLine = failed.length > 0 ? [`${describePlatforms(failed)} did not go through. ${STILL_POSTED}`] : [];
  const pendingLine =
    pending.length > 0
      ? [`${describePlatforms(pending)} may still be sending. Please check there before posting again.`]
      : [];
  const lines = [...sentLine, ...pendingLine, ...skippedLines, ...failedLine];
  return lines.length > 0 ? lines.join(" ") : SOCIAL_NOT_SET_UP_MESSAGE;
}
