import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  INTERNAL_FOUNDING_FAN_IDS,
  isHiddenFromPublicFoundingRoster,
} from "./founding-internal-fans.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

const STAFF = [
  "bf02e0cf-b740-407a-9436-222becfc3c49",
  "64aa29d4-a0fc-4653-ae5b-06586c0067a7",
  "84996598-c71a-42a8-812c-a2e3ea642de8",
  "1922bd3c-becc-4cac-afb8-ceeba8666bb4",
  "f198e0e2-5d69-489b-9736-26adf1a690ca",
  "f4c5819f-b340-4b7d-82c9-c5fff973eeb2",
  "094fd522-a559-472b-aab0-1aa49bba8aab",
];

const TESTS = [
  "234f4222-fe96-46e2-b403-9ca5fe3ac905",
  "44038dc7-7fb4-431c-86a3-02553a534c35",
  "4b83c23e-775b-455f-b792-e31601e85e5b",
  "e2e3d3ef-824a-4951-8cdc-70ed574c6544",
];

// Left public until Kevin confirms. Not hidden by id.
const LEFT_PUBLIC = [
  "d658254b-0f1f-47b1-8bff-d9f2d5ffc817", // Founding Fan #8
  "b393a127-6b96-4d48-8aa3-5ffc8f8cbffd", // Founding Fan #12
  "c52e1b95-8399-4379-a4ea-fef1ef1153db", // Morgan wallen #15
];

describe("public founding roster exclusions", () => {
  it("hides the seven staff accounts and four test accounts only", () => {
    assert.equal(INTERNAL_FOUNDING_FAN_IDS.length, 11);
    for (const id of [...STAFF, ...TESTS]) {
      assert.equal(isHiddenFromPublicFoundingRoster(id, false), true);
    }
    for (const id of LEFT_PUBLIC) {
      assert.equal(isHiddenFromPublicFoundingRoster(id, false), false);
    }
    assert.equal(
      isHiddenFromPublicFoundingRoster("11111111-1111-1111-1111-111111111111", true),
      true,
    );
    assert.equal(
      isHiddenFromPublicFoundingRoster("11111111-1111-1111-1111-111111111111", false),
      false,
    );
  });

  it("keeps the same ids in the manual script and the claim migration", () => {
    const script = readRepo("../../scripts/hide-internal-founding-fans.sql");
    const migration = readRepo("../../supabase/migrations/0071_internal_founding_fan_flag.sql");
    assert.match(script, /DO NOT put this file in supabase\/migrations/);
    assert.match(script, /is_internal = true/);
    assert.doesNotMatch(script, /delete from/i);
    assert.doesNotMatch(migration, /set is_internal = true/);
    for (const id of INTERNAL_FOUNDING_FAN_IDS) {
      assert.match(script, new RegExp(id));
      assert.match(migration, new RegExp(id));
    }
    for (const id of LEFT_PUBLIC) {
      assert.match(script, new RegExp(id));
      assert.doesNotMatch(migration, new RegExp(id));
    }
  });
});
