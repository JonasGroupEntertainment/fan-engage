import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { signupOnboardingHref } from "./signup-destination.ts";
import { safeAppPath } from "./safe-app-path.ts";

describe("fan destination continuity", () => {
  it("preserves artist and premium after switching signup -> login -> signup", () => {
    const original = signupOnboardingHref("/premium", "raelynn");
    assert.equal(signupOnboardingHref(original, null), original);
    const url = new URL(original, "https://example.com");
    assert.equal(url.searchParams.get("ref"), "raelynn");
    assert.equal(url.searchParams.get("next"), "/premium");
  });
  it("preserves an event's query and fragment", () => {
    const next = "/artists/raelynn?event=123#upcoming";
    const url = new URL(signupOnboardingHref(next, "raelynn"), "https://example.com");
    assert.equal(url.searchParams.get("next"), next);
  });
  it("prefers a new explicit artist and avoids nesting onboarding loops", () => {
    assert.equal(signupOnboardingHref("/onboarding?ref=old&next=%2Fonboarding", "raelynn"), "/onboarding?ref=raelynn");
    assert.equal(signupOnboardingHref(null, null), "/onboarding");
  });
  it("discards external nested destinations", () => {
    assert.equal(signupOnboardingHref("/onboarding?ref=raelynn&next=https%3A%2F%2Fevil.example", null), "/onboarding?ref=raelynn");
  });
});
describe("safe app paths", () => {
  it("rejects external and browser-normalized external URLs", () => {
    for (const path of ["//evil.example", "/\\evil.example", "/\n/evil.example", "https://evil.example", "javascript:alert(1)", " /rewards"]) {
      assert.equal(safeAppPath(path), null, JSON.stringify(path));
    }
  });
  it("retains encoded path segments and normal query parameters", () => {
    assert.equal(safeAppPath("/rewards?name=fan%20drop#details"), "/rewards?name=fan%20drop#details");
  });
});
