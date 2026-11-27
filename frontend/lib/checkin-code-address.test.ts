import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { addressWithoutCheckinCode, isFinalCheckinAnswer } from "./checkin-code-address.ts";

describe("addressWithoutCheckinCode", () => {
  it("removes only the code", () => {
    assert.equal(
      addressWithoutCheckinCode("https://x.test/artists/raelynn/checkin?t=abc", "t"),
      "/artists/raelynn/checkin",
    );
    assert.equal(
      addressWithoutCheckinCode("https://x.test/artists/raelynn/checkin?a=1&t=abc#top", "t"),
      "/artists/raelynn/checkin?a=1#top",
    );
  });

  it("returns null when there is nothing to remove or the address is unreadable", () => {
    assert.equal(addressWithoutCheckinCode("https://x.test/artists/raelynn/checkin", "t"), null);
    assert.equal(addressWithoutCheckinCode("not an address", "t"), null);
  });
});

describe("isFinalCheckinAnswer", () => {
  it("is true once the visit is recorded, already recorded, or the code expired", () => {
    for (const state of ["success", "already", "token_expired"]) {
      assert.equal(isFinalCheckinAnswer(state), true, state);
    }
  });

  it("keeps the code while the fan still has to sign in or retry", () => {
    for (const state of ["loading", "unauthenticated", "token_required", "error"]) {
      assert.equal(isFinalCheckinAnswer(state), false, state);
    }
  });
});

describe("check-in page", () => {
  const page = readFileSync(
    new URL("../app/artists/[slug]/checkin/page.tsx", import.meta.url),
    "utf8",
  );

  it("does not check in a second time after the address changes", () => {
    assert.match(page, /if \(answered\.current\) return;/);
    assert.match(page, /addressWithoutCheckinCode\(window\.location\.href, TOKEN_PARAM\)/);
  });

  it("explains the second sign-in to a fan who scanned the code", () => {
    assert.match(page, /Your camera opened this page in a browser where you\s+are not signed in yet/);
  });
});
