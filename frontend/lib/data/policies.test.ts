import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  policyDocumentTitle,
  policyRobots,
  type PolicyPage,
} from "./policies.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

function publishedPolicy(overrides: Partial<PolicyPage> = {}): PolicyPage {
  return {
    slug: "cookie_policy",
    title: "Cookie Policy",
    content_md: "# Cookies",
    effective_date: "2026-09-18",
    is_draft: false,
    updated_at: "2026-09-18T00:00:00.000Z",
    ...overrides,
  };
}

const cookiePage = readRepo("../../app/cookie-policy/page.tsx");
const termsPage = readRepo("../../app/terms/page.tsx");
const privacyPage = readRepo("../../app/privacy/page.tsx");
const cancellationPage = readRepo("../../app/cancellation-refund/page.tsx");
const rewardsPage = readRepo("../../app/rewards-terms/page.tsx");
const metadataHelper = readRepo("../../app/(legal)/policy-metadata.ts");

describe("policyRobots", () => {
  it("noindexes missing policies", () => {
    assert.deepEqual(policyRobots(null), { index: false, follow: false });
  });

  it("noindexes drafts", () => {
    assert.deepEqual(policyRobots(publishedPolicy({ is_draft: true })), {
      index: false,
      follow: false,
    });
  });

  it("allows indexing when is_draft is false", () => {
    assert.deepEqual(policyRobots(publishedPolicy()), {
      index: true,
      follow: true,
    });
  });
});

describe("policyDocumentTitle", () => {
  it("uses the stored title when present", () => {
    assert.equal(
      policyDocumentTitle(publishedPolicy({ title: " Cookies " }), "Cookie Policy"),
      "Cookies",
    );
  });

  it("falls back when the record is missing or untitled", () => {
    assert.equal(policyDocumentTitle(null, "Cookie Policy"), "Cookie Policy");
    assert.equal(
      policyDocumentTitle(publishedPolicy({ title: "  " }), "Cookie Policy"),
      "Cookie Policy",
    );
  });
});

describe("legal PolicyPage wrappers use draft-aware metadata", () => {
  it("loads policy robots from generatePolicyMetadata instead of hardcoded noindex", () => {
    assert.match(metadataHelper, /getPolicy/);
    assert.match(metadataHelper, /policyRobots/);

    for (const [src, slug, title] of [
      [cookiePage, "cookie_policy", "Cookie Policy"],
      [termsPage, "terms", "Terms of Service"],
      [privacyPage, "privacy", "Privacy Policy"],
      [cancellationPage, "cancellation_refund", "Cancellation & Refund Policy"],
      [rewardsPage, "rewards_terms", "Rewards Program Terms & Conditions"],
    ] as const) {
      assert.match(src, /export async function generateMetadata/);
      assert.match(src, /generatePolicyMetadata/);
      assert.match(src, new RegExp(`generatePolicyMetadata\\([\\s\\S]*"${slug}"`));
      assert.match(src, new RegExp(`"${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
      assert.match(src, /export const dynamic = "force-dynamic"/);
      assert.doesNotMatch(src, /index:\s*false/);
    }
  });
});
