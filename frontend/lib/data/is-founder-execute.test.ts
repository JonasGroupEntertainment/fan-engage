import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("migration 0093 is_founder execute for RLS", () => {
  const sql = read("../../../supabase/migrations/0093_is_founder_execute_for_rls.sql");
  it("grants client execute on is_founder so the 0091 policy can call it", () => {
    assert.match(sql, /grant execute on function public\.is_founder\(uuid, text\) to anon, authenticated;/);
    assert.doesNotMatch(sql, /drop (table|function|policy)/i);
  });
  it("0091's policy really does reference is_founder (the reason this grant exists)", () => {
    const m91 = read("../../../supabase/migrations/0091_presave_and_ai_gates.sql");
    assert.match(m91, /is_founder\(auth\.uid\(\), artist_slug\)/);
  });
});
