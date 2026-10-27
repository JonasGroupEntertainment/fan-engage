import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  digestLogStatus,
  formatMailchimpFailure,
  subscriberHash,
  unsentCampaignError,
} from "./outcomes.ts";

describe("subscriberHash", () => {
  it("hashes the trimmed lowercase email", () => {
    const expected = createHash("md5").update("fan@example.com").digest("hex");
    assert.equal(subscriberHash("  Fan@Example.com "), expected);
    assert.equal(subscriberHash("fan@example.com"), expected);
  });
});

describe("digestLogStatus", () => {
  it("maps skip attempt statuses onto the digest_log check constraint", () => {
    assert.equal(digestLogStatus("skipped_no_payload"), "skipped");
    assert.equal(digestLogStatus("skipped_subscriber_missing"), "skipped");
    assert.equal(digestLogStatus("error"), "error");
    assert.equal(digestLogStatus("rendered"), "rendered");
    assert.equal(digestLogStatus("merge_fields_updated"), "merge_fields_updated");
  });
});

describe("formatMailchimpFailure", () => {
  it("keeps the merge-field name and Mailchimp's message", () => {
    const body = JSON.stringify({
      title: "Invalid Resource",
      detail: "The resource submitted could not be validated.",
      errors: [
        {
          field: "merge_fields.DIGESTHTML",
          message: "Value is longer than the maximum length",
        },
      ],
    });
    const text = formatMailchimpFailure("PUT member", 400, body);
    assert.match(text, /^Mailchimp PUT member 400:/);
    assert.match(text, /merge_fields\.DIGESTHTML: Value is longer than the maximum length/);
    assert.match(text, /Invalid Resource/);
  });

  it("falls back to the raw body when Mailchimp does not return JSON", () => {
    assert.equal(
      formatMailchimpFailure("PUT member", 401, "API key invalid"),
      "Mailchimp PUT member 401: API key invalid",
    );
    assert.equal(
      formatMailchimpFailure("PUT member", 502, "  "),
      "Mailchimp PUT member 502: (empty body)",
    );
  });
});

describe("unsentCampaignError", () => {
  it("does not fail a run whose fans were only skipped", () => {
    assert.equal(
      unsentCampaignError({ totalCandidates: 4, errors: [] }),
      null,
    );
    assert.equal(
      unsentCampaignError({ totalCandidates: 0, errors: [] }),
      null,
    );
  });

  it("names each fan and the reason when merge fields were not updated", () => {
    const message = unsentCampaignError({
      totalCandidates: 2,
      errors: [
        {
          fan_id: "11111111-1111-1111-1111-111111111111",
          error: "Mailchimp PUT member 400: merge_fields.DIGESTHTML: field does not exist",
        },
        {
          fan_id: "22222222-2222-2222-2222-222222222222",
          error: "digest_log upsert failed: new row violates check constraint",
        },
      ],
    });
    assert.match(message ?? "", /skipping campaign send/);
    assert.match(message ?? "", /11111111-1111-1111-1111-111111111111: Mailchimp PUT member 400/);
    assert.match(message ?? "", /22222222-2222-2222-2222-222222222222: digest_log upsert failed/);
  });
});

describe("gather follow column", () => {
  it("selects fan_artist_following.followed_at", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./gather.ts", import.meta.url)),
      "utf8",
    );
    assert.match(source, /\.select\("artist_slug, followed_at"\)/);
    assert.doesNotMatch(source, /select\("artist_slug, created_at"\)/);
    assert.match(source, /rowsOrThrow\(\s*"fan_artist_following"/);
  });
});
