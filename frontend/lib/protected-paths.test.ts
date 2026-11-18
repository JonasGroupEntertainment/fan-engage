import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { isProtectedPath } from "./protected-paths.ts";

const proxy = readFileSync(fileURLToPath(new URL("../proxy.ts", import.meta.url)), "utf8");

describe("protected paths (BEP #190 port)", () => {
  it("covers the fan pages, admin and inbox", () => {
    for (const path of ["/me", "/me/card", "/me/notifications", "/admin", "/admin/artists", "/inbox"]) {
      assert.equal(isProtectedPath(path), true, path);
    }
  });

  it("does not catch look-alike public paths", () => {
    for (const path of ["/menu", "/media", "/", "/artists/raelynn", "/login", "/signup", "/administrators"]) {
      assert.equal(isProtectedPath(path), false, path);
    }
  });

  it("the proxy uses the shared helper", () => {
    assert.match(proxy, /const isProtected = isProtectedPath\(pathname\)/);
    assert.doesNotMatch(proxy, /const PROTECTED_PREFIXES/);
  });
});
