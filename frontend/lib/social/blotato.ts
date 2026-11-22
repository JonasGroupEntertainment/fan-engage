// Blotato REST client for publishing one post. Request shape follows the
// published docs (help.blotato.com, REST API reference, "Publish post"),
// read on 2026-11-22:
//   POST https://backend.blotato.com/v2/posts
//   header  blotato-api-key: <key>   (no "Bearer")
//   body    { post: { accountId, content: { text, mediaUrls, platform },
//                     target: { targetType, pageId? } } }
//   201     { postSubmissionId }
// Media: any public image address may be passed in mediaUrls directly.
// Documented rate limit for this route: 30 requests a minute.
//
// fetch is injected so tests never touch the network. Errors come back as
// values. The key is never logged or put in an error.
import type { SocialSendRequest } from "./social-post.ts";

export const BLOTATO_POSTS_URL = "https://backend.blotato.com/v2/posts";
export const BLOTATO_API_KEY_HEADER = "blotato-api-key";
export const BLOTATO_TIMEOUT_MS = 8000;
const MAX_ERROR_LENGTH = 300;
const TIMED_OUT = "Timed out";
const NO_KEY = "No Blotato key is set";
const NO_SUBMISSION_ID = "Blotato did not return a submission id";

export type PublishResult = { ok: true; providerRef: string } | { ok: false; error: string };

export interface SocialPublisher {
  publish(request: SocialSendRequest): Promise<PublishResult>;
}

type BlotatoTarget = { targetType: "facebook"; pageId: string } | { targetType: "instagram" };

export type BlotatoPostBody = {
  post: {
    accountId: string;
    content: { text: string; mediaUrls: string[]; platform: SocialSendRequest["platform"] };
    target: BlotatoTarget;
  };
};

/** Facebook needs the Page id. Instagram needs only its target type. */
function buildTarget(request: SocialSendRequest): BlotatoTarget {
  return request.platform === "facebook"
    ? { targetType: "facebook", pageId: request.pageId ?? "" }
    : { targetType: "instagram" };
}

export function buildBlotatoPostBody(request: SocialSendRequest): BlotatoPostBody {
  return {
    post: {
      accountId: request.accountId,
      content: { text: request.text, mediaUrls: [...request.mediaUrls], platform: request.platform },
      target: buildTarget(request),
    },
  };
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * The docs show { statusCode, message } for a 429 on the media route but
 * give no general error shape for this route, so this reads `message`
 * when it is there and otherwise reports the status alone.
 */
function describeErrorResponse(status: number, bodyText: string): string {
  const message = parseJsonObject(bodyText)?.message;
  const text = typeof message === "string" && message.trim() ? `HTTP ${status}: ${message.trim()}` : `HTTP ${status}`;
  return text.slice(0, MAX_ERROR_LENGTH);
}

function isTimeout(err: unknown): boolean {
  return err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
}

function describeThrown(err: unknown, apiKey: string): string {
  if (isTimeout(err)) return TIMED_OUT;
  const message = err instanceof Error ? err.message : "Request failed";
  return message.split(apiKey).join("[key]").slice(0, MAX_ERROR_LENGTH);
}

async function readResult(response: Response): Promise<PublishResult> {
  const bodyText = await response.text();
  if (!response.ok) return { ok: false, error: describeErrorResponse(response.status, bodyText) };
  const submissionId = parseJsonObject(bodyText)?.postSubmissionId;
  return typeof submissionId === "string" && submissionId
    ? { ok: true, providerRef: submissionId }
    : { ok: false, error: NO_SUBMISSION_ID };
}

export function createBlotatoPublisher(options: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): SocialPublisher {
  const apiKey = options.apiKey.trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? BLOTATO_TIMEOUT_MS;

  async function publish(request: SocialSendRequest): Promise<PublishResult> {
    if (!apiKey) return { ok: false, error: NO_KEY };
    try {
      const response = await fetchImpl(BLOTATO_POSTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", [BLOTATO_API_KEY_HEADER]: apiKey },
        body: JSON.stringify(buildBlotatoPostBody(request)),
        signal: AbortSignal.timeout(timeoutMs),
      });
      return await readResult(response);
    } catch (err) {
      return { ok: false, error: describeThrown(err, apiKey) };
    }
  }

  return { publish };
}
