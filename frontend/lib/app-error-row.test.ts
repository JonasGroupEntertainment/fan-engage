import { test } from "node:test";
import assert from "node:assert/strict";
import { clientErrorRow, serverErrorRow } from "./app-error-row.ts";

test("a server error becomes a redacted row without the query string", () => {
  const err = Object.assign(new Error("Failed for jane@example.com"), { digest: "123456789" });
  assert.deepEqual(serverErrorRow(err, { path: "/artists/raelynn?token=abc" }, { routePath: "/artists/[slug]", routeType: "render" }), {
    source: "server",
    message: "Failed for [email]",
    digest: "123456789",
    path: "/artists/raelynn",
    route_path: "/artists/[slug]",
    route_type: "render",
  });
});

test("Next.js control-flow throws are not recorded", () => {
  assert.equal(serverErrorRow(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" }), { path: "/" }, {}), null);
  assert.equal(serverErrorRow(Object.assign(new Error("x"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }), { path: "/" }, {}), null);
  assert.equal(serverErrorRow(new Error("Dynamic server usage: Route /x couldn't be rendered statically"), { path: "/" }, {}), null);
});

test("odd inputs still give a safe row", () => {
  const row = serverErrorRow("plain string thrown", {}, {});
  assert.equal(row?.message, "plain string thrown");
  assert.equal(row?.path, "/");
  assert.equal(row?.digest, null);
  assert.equal(row?.route_path, null);
});

test("a client report maps straight across", () => {
  assert.deepEqual(clientErrorRow({ message: "boom", digest: null, path: "/me" }), {
    source: "client",
    message: "boom",
    digest: null,
    path: "/me",
    route_path: null,
    route_type: null,
  });
});
