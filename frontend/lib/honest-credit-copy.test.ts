import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The $5 monthly credit is granted every month, but nothing can spend it
// yet. Fan-facing copy must not promise it is spent at checkout.
const here = dirname(fileURLToPath(import.meta.url));
const dashboard = readFileSync(
  join(here, "..", "components", "fan-home-dashboard.tsx"),
  "utf8",
);

test("monthly credit card does not promise checkout spending", () => {
  assert.doesNotMatch(dashboard, /Used automatically at checkout/);
});

test("monthly credit card says the balance is saved and spending is coming soon", () => {
  assert.match(dashboard, /Saved to your account\. Ways to spend it are coming soon\./);
  assert.match(dashboard, /Monthly credit[\s\S]{0,400}Coming soon/);
});

test("monthly credit card still shows the balance", () => {
  assert.match(dashboard, /\$\{dollars\}/);
});
