import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { stripeSignatureFailureWarning } from "./stripe-webhook-signature.ts";

const routeTs = readFileSync(
  fileURLToPath(new URL("../app/api/stripe/webhook/route.ts", import.meta.url)),
  "utf8",
);

describe("stripeSignatureFailureWarning", () => {
  it("names a secret mismatch without copying the Stripe error text", () => {
    const line = stripeSignatureFailureWarning(
      new Error(
        "No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe?",
      ),
    );
    assert.match(line, /event type unknown/);
    assert.match(line, /signing secret does not match this endpoint/);
    assert.equal(line.includes("raw request body"), false);
    assert.equal(line.includes("payload."), false);
  });

  it("does not echo a secret, signature, or payload stuffed into the error", () => {
    const secret = "whsec_test_secret_value_not_for_logs";
    const payload = '{"id":"evt_123","type":"invoice.paid"}';
    const line = stripeSignatureFailureWarning(
      new Error(`verify failed secret=${secret} body=${payload}`),
    );
    assert.match(line, /event type unknown/);
    assert.match(line, /signature rejected/);
    assert.equal(line.includes(secret), false);
    assert.equal(line.includes("invoice.paid"), false);
    assert.equal(line.includes("evt_123"), false);
  });

  it("stays short when the error is not an Error", () => {
    const line = stripeSignatureFailureWarning("whsec_another_secret");
    assert.match(line, /signature rejected/);
    assert.equal(line.includes("whsec_another_secret"), false);
  });
});

describe("webhook route logging", () => {
  it("logs only the short warning when verification throws", () => {
    const catchBlock = routeTs.slice(routeTs.indexOf("} catch (err) {"));
    assert.match(catchBlock, /stripeSignatureFailureWarning\(err\)/);
    assert.match(catchBlock, /console\.warn\(stripeSignatureFailureWarning\(err\)\)/);
    assert.equal(catchBlock.includes("console.warn"), true);
    assert.doesNotMatch(catchBlock, /console\.warn\([^)]*msg/);
    assert.doesNotMatch(catchBlock, /console\.warn\([^)]*body/);
    assert.doesNotMatch(catchBlock, /console\.warn\([^)]*secret/);
    assert.doesNotMatch(catchBlock, /console\.warn\([^)]*sig/);
  });
});
