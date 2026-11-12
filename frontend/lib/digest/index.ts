/**
 * Public surface of the digest module.
 * Always import from "@/lib/digest".
 */

export type {
  DigestRecipient,
  DigestPostHighlight,
  DigestEvent,
  DigestRewardSuggestion,
  DigestCommunityBlock,
  DigestPayload,
} from "./types";

export { gatherDigestPayload, type DigestGatherResult } from "./gather";

export {
  summarizeAllCommunities,
  SUMMARY_MODEL,
  SUMMARY_PROMPT_VERSION,
  SummarizeError,
} from "./summarize";

export { renderDigestPayload } from "./render";
