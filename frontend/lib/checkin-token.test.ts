import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CHECKIN_TOKEN_EXPIRED_CODE,
  CHECKIN_TOKEN_PARAM,
  EXPIRED_LOOKBACK_BUCKETS,
  ROTATION_SECONDS,
  checkinPath,
  checkinRotationEnabled,
  checkinSecretFromEnv,
  checkinTokenBucket,
  checkinTokenDecision,
  checkinTokenExpiresAt,
  isExpiredCheckinToken,
  mintCheckinToken,
  signCheckinToken,
  verifyCheckinToken,
} from "./checkin-token.ts";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; // secret-ok
const ON = { CHECKIN_TOKEN_SECRET: SECRET };
const OFF = { CHECKIN_TOKEN_SECRET: SECRET, CHECKIN_TOKEN_ROTATION: "off" };
const UNSET = {};

// A fixed instant well inside a bucket so +/- a few seconds stays put.
const BUCKET_MS = ROTATION_SECONDS * 1000;
const NOW = 1_800_000_000_000 - (1_800_000_000_000 % BUCKET_MS) + 300_000; // 5 min in

describe("rotation constants", () => {
  it("rotates every 15 minutes and recognises a day of stale codes", () => {
    assert.equal(ROTATION_SECONDS, 900);
    assert.equal(EXPIRED_LOOKBACK_BUCKETS, 96);
    assert.equal(CHECKIN_TOKEN_EXPIRED_CODE, "expired_code");
    assert.equal(CHECKIN_TOKEN_PARAM, "t");
  });

  it("buckets by floor(unixSeconds / ROTATION_SECONDS)", () => {
    assert.equal(checkinTokenBucket(0), 0);
    assert.equal(checkinTokenBucket(BUCKET_MS - 1), 0);
    assert.equal(checkinTokenBucket(BUCKET_MS), 1);
    assert.equal(checkinTokenBucket(NOW), Math.floor(NOW / BUCKET_MS));
  });

  it("checkinTokenExpiresAt is the end of the current bucket", () => {
    const expires = checkinTokenExpiresAt(NOW);
    assert.equal(expires % BUCKET_MS, 0);
    assert.ok(expires > NOW);
    assert.ok(expires - NOW <= BUCKET_MS);
    assert.equal(checkinTokenBucket(expires), checkinTokenBucket(NOW) + 1);
  });
});

describe("checkinRotationEnabled", () => {
  it("is off when CHECKIN_TOKEN_SECRET is unset or blank", () => {
    assert.equal(checkinRotationEnabled(UNSET), false);
    assert.equal(checkinRotationEnabled({ CHECKIN_TOKEN_SECRET: "  " }), false);
    assert.equal(
      checkinRotationEnabled({ CHECKIN_TOKEN_ROTATION: "on" }),
      false,
      "rotation flag alone cannot turn it on",
    );
  });

  it("is on when the secret is set, for any flag value other than off", () => {
    assert.equal(checkinRotationEnabled(ON), true);
    assert.equal(checkinRotationEnabled({ ...ON, CHECKIN_TOKEN_ROTATION: "on" }), true);
    assert.equal(checkinRotationEnabled({ ...ON, CHECKIN_TOKEN_ROTATION: "false" }), true);
  });

  it("is off for CHECKIN_TOKEN_ROTATION=off even with a secret", () => {
    assert.equal(checkinRotationEnabled(OFF), false);
    assert.equal(checkinRotationEnabled({ ...ON, CHECKIN_TOKEN_ROTATION: " OFF " }), false);
  });
});

describe("signCheckinToken / verifyCheckinToken", () => {
  it("accepts a token signed for the same artist in the same bucket", () => {
    const token = signCheckinToken("raelynn", SECRET, NOW);
    assert.equal(verifyCheckinToken("raelynn", token, SECRET, NOW), true);
  });

  it("is stable within a bucket and url safe", () => {
    const a = signCheckinToken("raelynn", SECRET, NOW);
    assert.equal(a, signCheckinToken("raelynn", SECRET, NOW + 60_000));
    assert.match(a, /^[A-Za-z0-9_-]+$/);
  });

  it("rotates across buckets", () => {
    const a = signCheckinToken("raelynn", SECRET, NOW);
    const b = signCheckinToken("raelynn", SECRET, NOW + BUCKET_MS);
    const c = signCheckinToken("raelynn", SECRET, NOW + 2 * BUCKET_MS);
    assert.notEqual(a, b);
    assert.notEqual(b, c);
    assert.notEqual(a, c);
  });

  it("accepts the previous bucket (grace window)", () => {
    const token = signCheckinToken("raelynn", SECRET, NOW);
    assert.equal(verifyCheckinToken("raelynn", token, SECRET, NOW + BUCKET_MS), true);
  });

  it("rejects two buckets back and tokens from the future", () => {
    const token = signCheckinToken("raelynn", SECRET, NOW);
    assert.equal(verifyCheckinToken("raelynn", token, SECRET, NOW + 2 * BUCKET_MS), false);
    assert.equal(verifyCheckinToken("raelynn", token, SECRET, NOW - BUCKET_MS), false);
  });

  it("ignores slug case and surrounding spaces", () => {
    const token = signCheckinToken("RaeLynn ", SECRET, NOW);
    assert.equal(verifyCheckinToken("raelynn", token, SECRET, NOW), true);
  });

  it("rejects a token made for another artist", () => {
    const token = signCheckinToken("other-artist", SECRET, NOW);
    assert.equal(verifyCheckinToken("raelynn", token, SECRET, NOW), false);
  });

  it("rejects a token made with another secret", () => {
    const token = signCheckinToken("raelynn", "other-secret", NOW);
    assert.equal(verifyCheckinToken("raelynn", token, SECRET, NOW), false);
  });

  it("rejects empty, short, long and tampered tokens", () => {
    const token = signCheckinToken("raelynn", SECRET, NOW);
    for (const bad of [
      "",
      null,
      undefined,
      "abc",
      `${token}x`,
      token.slice(0, -1),
      `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`,
    ]) {
      assert.equal(verifyCheckinToken("raelynn", bad, SECRET, NOW), false, String(bad));
    }
  });
});

describe("isExpiredCheckinToken", () => {
  it("is false for a current or grace-window token", () => {
    const token = signCheckinToken("raelynn", SECRET, NOW);
    assert.equal(isExpiredCheckinToken("raelynn", token, SECRET, NOW), false);
    assert.equal(isExpiredCheckinToken("raelynn", token, SECRET, NOW + BUCKET_MS), false);
  });

  it("is true from two buckets back up to the lookback limit", () => {
    const token = signCheckinToken("raelynn", SECRET, NOW);
    assert.equal(isExpiredCheckinToken("raelynn", token, SECRET, NOW + 2 * BUCKET_MS), true);
    assert.equal(
      isExpiredCheckinToken("raelynn", token, SECRET, NOW + EXPIRED_LOOKBACK_BUCKETS * BUCKET_MS),
      true,
    );
    assert.equal(
      isExpiredCheckinToken(
        "raelynn",
        token,
        SECRET,
        NOW + (EXPIRED_LOOKBACK_BUCKETS + 1) * BUCKET_MS,
      ),
      false,
    );
  });

  it("is false for garbage and other artists", () => {
    assert.equal(isExpiredCheckinToken("raelynn", "wrong", SECRET, NOW), false);
    const other = signCheckinToken("other-artist", SECRET, NOW);
    assert.equal(isExpiredCheckinToken("raelynn", other, SECRET, NOW + 3 * BUCKET_MS), false);
  });
});

describe("constant-time compare", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./checkin-token.ts", import.meta.url)),
    "utf8",
  );

  it("still compares tokens with timingSafeEqual and never with ===", () => {
    assert.match(source, /timingSafeEqual\(/);
    assert.doesNotMatch(source, /given\s*===\s*expected/);
    assert.doesNotMatch(source, /token\s*===\s*sign/);
  });

  it("checks both grace buckets rather than short-circuiting on the first", () => {
    assert.match(source, /const current = tokenEquals\([\s\S]*const previous = tokenEquals\(/);
  });
});

describe("checkinTokenDecision", () => {
  it("unset secret == rotation off: allows everything and ignores the token", () => {
    assert.deepEqual(checkinTokenDecision("raelynn", null, NOW, UNSET), {
      allow: true,
      reason: "rotation_off",
    });
    assert.deepEqual(checkinTokenDecision("raelynn", "junk", NOW, UNSET), {
      allow: true,
      reason: "rotation_off",
    });
  });

  it("CHECKIN_TOKEN_ROTATION=off accepts a missing or wrong token (legacy static URL)", () => {
    assert.deepEqual(checkinTokenDecision("raelynn", null, NOW, OFF), {
      allow: true,
      reason: "rotation_off",
    });
    assert.deepEqual(checkinTokenDecision("raelynn", "", NOW, OFF), {
      allow: true,
      reason: "rotation_off",
    });
    assert.deepEqual(checkinTokenDecision("raelynn", "wrong", NOW, OFF), {
      allow: true,
      reason: "rotation_off",
    });
  });

  it("denies a missing token once rotation is on", () => {
    assert.deepEqual(checkinTokenDecision("raelynn", null, NOW, ON), {
      allow: false,
      reason: "missing",
    });
    assert.deepEqual(checkinTokenDecision("raelynn", "   ", NOW, ON), {
      allow: false,
      reason: "missing",
    });
  });

  it("denies a wrong token once rotation is on", () => {
    assert.deepEqual(checkinTokenDecision("raelynn", "wrong", NOW, ON), {
      allow: false,
      reason: "invalid",
    });
    const other = signCheckinToken("other-artist", SECRET, NOW);
    assert.deepEqual(checkinTokenDecision("raelynn", other, NOW, ON), {
      allow: false,
      reason: "invalid",
    });
  });

  it("allows a valid token, including one from the previous bucket", () => {
    const token = signCheckinToken("raelynn", SECRET, NOW);
    assert.deepEqual(checkinTokenDecision("raelynn", token, NOW, ON), {
      allow: true,
      reason: "valid",
    });
    assert.deepEqual(checkinTokenDecision("raelynn", token, NOW + BUCKET_MS, ON), {
      allow: true,
      reason: "valid",
    });
  });

  it("reports a rotated-out token as expired", () => {
    const token = signCheckinToken("raelynn", SECRET, NOW);
    assert.deepEqual(checkinTokenDecision("raelynn", token, NOW + 2 * BUCKET_MS, ON), {
      allow: false,
      reason: "expired",
    });
  });
});

describe("checkinSecretFromEnv", () => {
  it("treats missing or blank as not configured", () => {
    assert.equal(checkinSecretFromEnv({}), null);
    assert.equal(checkinSecretFromEnv({ CHECKIN_TOKEN_SECRET: "   " }), null);
  });

  it("returns the trimmed secret when set", () => {
    assert.equal(checkinSecretFromEnv({ CHECKIN_TOKEN_SECRET: " abc " }), "abc");
  });
});

describe("checkinPath", () => {
  it("builds the plain FE artist path without a token", () => {
    assert.equal(checkinPath("raelynn"), "/artists/raelynn/checkin");
    assert.equal(checkinPath("RaeLynn", null), "/artists/raelynn/checkin");
  });

  it("adds the token as a query parameter", () => {
    const token = signCheckinToken("raelynn", SECRET, NOW);
    assert.equal(
      checkinPath("raelynn", token),
      `/artists/raelynn/checkin?${CHECKIN_TOKEN_PARAM}=${token}`,
    );
  });
});

describe("mintCheckinToken", () => {
  it("returns the static path with rotation off (unset secret or flag off)", () => {
    for (const env of [UNSET, OFF]) {
      const mint = mintCheckinToken("raelynn", NOW, env);
      assert.equal(mint.rotation, "off");
      assert.equal(mint.token, null);
      assert.equal(mint.expiresAt, null);
      assert.equal(mint.path, "/artists/raelynn/checkin");
      assert.equal(mint.rotationSeconds, ROTATION_SECONDS);
    }
  });

  it("returns a signed path that verifies when rotation is on", () => {
    const mint = mintCheckinToken("raelynn", NOW, ON);
    assert.equal(mint.rotation, "on");
    assert.ok(mint.token);
    assert.equal(mint.expiresAt, checkinTokenExpiresAt(NOW));
    assert.equal(mint.path, checkinPath("raelynn", mint.token));
    assert.deepEqual(checkinTokenDecision("raelynn", mint.token, NOW, ON), {
      allow: true,
      reason: "valid",
    });
  });
});

describe("check-in API wiring", () => {
  const route = readFileSync(
    fileURLToPath(new URL("../app/api/checkin/route.ts", import.meta.url)),
    "utf8",
  );
  const page = readFileSync(
    fileURLToPath(new URL("../app/artists/[slug]/checkin/page.tsx", import.meta.url)),
    "utf8",
  );

  it("POST /api/checkin decides via checkinTokenDecision and warns once when off", () => {
    assert.match(route, /checkinTokenDecision\(/);
    assert.match(route, /CHECKIN_TOKEN_EXPIRED_CODE/);
    assert.match(route, /warnedRotationOff/);
  });

  it("the fan page forwards ?t= as token in the POST body", () => {
    assert.match(page, /useSearchParams/);
    assert.match(page, /token/);
    assert.match(page, /artist_slug/);
  });
});
