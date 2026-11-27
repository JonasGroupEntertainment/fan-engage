import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClientErrorReport, parseClientErrorReport, redactErrorText, safeErrorPath } from "./client-error-report.ts";

test("blanks out emails, long numbers and tokens", () => {
  assert.equal(
    redactErrorText("Failed for jane.doe@example.com phone 7045551234 key abcdefghijklmnopqrstuvwxyz0123456789"),
    "Failed for [email] phone [number] key [token]",
  );
});

test("keeps only the path, never the query or fragment", () => {
  assert.equal(safeErrorPath("/artists/raelynn/community?token_hash=abc#x"), "/artists/raelynn/community");
  assert.equal(safeErrorPath("https://evil.example/x"), "/");
  assert.equal(safeErrorPath(""), "/");
});

test("builds a capped report and drops a bad digest", () => {
  const r = buildClientErrorReport({ message: "word ".repeat(200), digest: "<script>", path: "/me" });
  assert.equal(r.message.length, 300);
  assert.equal(r.digest, null);
  assert.equal(r.path, "/me");
  assert.equal(buildClientErrorReport({ message: "boom", digest: "12345-abc", path: "/" }).digest, "12345-abc");
});

test("parses a JSON body, re-redacts it, and refuses junk", () => {
  assert.deepEqual(parseClientErrorReport('{"message":"oops a@b.co","digest":"9","path":"/me?x=1"}'), {
    message: "oops [email]",
    digest: "9",
    path: "/me",
  });
  assert.equal(parseClientErrorReport("not json"), null);
  assert.equal(parseClientErrorReport('{"message":1,"path":"/"}'), null);
  assert.equal(parseClientErrorReport("x".repeat(2001)), null);
  assert.equal(parseClientErrorReport(null), null);
});

test("never keeps a fan's handle, an invite code or a shared item in the path", () => {
  assert.equal(safeErrorPath("/fans/fan-ab12"), "/fans/[fan]");
  assert.equal(safeErrorPath("/fans/fan-ab12/badges?x=1"), "/fans/[fan]/badges");
  assert.equal(safeErrorPath("/invite/ABC123"), "/invite/[code]");
  assert.equal(safeErrorPath("/share/reward/gold-ticket"), "/share/reward/[id]");
  assert.equal(safeErrorPath("/artists/raelynn/community"), "/artists/raelynn/community");
  assert.equal(safeErrorPath("/fans"), "/fans");
});

test("blanks out phone numbers and values quoted by the database", () => {
  assert.equal(redactErrorText("call 615-555-0123 or (615) 555-0123"), "call [number] or [number]");
  assert.equal(
    redactErrorText('duplicate key: Key (profile_slug)=(fan-ab12) already exists'),
    "duplicate key: Key (profile_slug)=([value]) already exists",
  );
});
