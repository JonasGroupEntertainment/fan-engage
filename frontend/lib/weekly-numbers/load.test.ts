import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadWeeklyNumbers } from "./load.ts";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[] | Error>;

/** A stand-in client: every filter is ignored, rows come back in pages. */
function fakeAdmin(tables: Tables, calls: string[] = []) {
  return {
    from(table: string) {
      calls.push(table);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "neq", "gt", "gte", "in", "order"]) {
        builder[method] = () => builder;
      }
      builder.range = async (from: number, to: number) => {
        const rows = tables[table];
        if (rows instanceof Error) return { data: null, error: { message: rows.message } };
        return { data: (rows ?? []).slice(from, to + 1), error: null };
      };
      return builder;
    },
  } as never;
}

const now = new Date("2026-11-27T17:00:00Z");
const fan = (id: string) => ({ id, is_internal: false, suspended: false, email: null });

describe("loadWeeklyNumbers", () => {
  it("reads every page of a long list", async () => {
    const memberships = Array.from({ length: 2500 }, (_, i) => ({
      fan_id: `f${i}`,
      joined_at: "2026-06-01T12:00:00Z",
    }));
    const result = await loadWeeklyNumbers(
      fakeAdmin({
        fan_community_memberships: memberships,
        fans: memberships.slice(0, 200).map((m) => fan(m.fan_id)),
      }),
      "raelynn",
      now,
    );
    // The stand-in returns the same 200 flag rows for each chunk of ids, so
    // only those 200 fans are known to be real.
    assert.equal(result.totalFans, 200);
    assert.deepEqual(result.unread, []);
    assert.equal(result.rows.length, 8);
  });

  it("reports a list it could not read and shows it as unknown", async () => {
    const result = await loadWeeklyNumbers(
      fakeAdmin({
        fan_community_memberships: [{ fan_id: "a", joined_at: "2026-11-24T15:00:00Z" }],
        fans: [fan("a")],
        points_ledger: new Error("boom"),
      }),
      "raelynn",
      now,
    );
    assert.deepEqual(result.unread, ["points activity"]);
    assert.equal(result.rows[0].activeFans, null);
    assert.equal(result.rows[0].newFans, 1);
  });

  it("shows everything as unknown when the account checks fail", async () => {
    const result = await loadWeeklyNumbers(
      fakeAdmin({
        fan_community_memberships: [{ fan_id: "a", joined_at: "2026-11-24T15:00:00Z" }],
        fans: new Error("boom"),
      }),
      "raelynn",
      now,
    );
    assert.deepEqual(result.unread, ["account checks"]);
    assert.equal(result.totalFans, null);
    assert.equal(result.rows[0].newFans, null);
  });
});

describe("week by week page", () => {
  const page = readFileSync(
    new URL("../../app/admin/analytics/[communityId]/weeks/page.tsx", import.meta.url),
    "utf8",
  );
  const loader = readFileSync(new URL("./load.ts", import.meta.url), "utf8");

  it("is only for an admin of that community", () => {
    assert.match(page, /if \(!ctx\) notFound\(\);/);
    assert.match(page, /if \(!ctx\.isSuperAdmin && !ctx\.communities\.includes\(communityId\)\) notFound\(\);/);
    assert.ok(page.indexOf("!ctx.communities.includes(communityId)") < page.indexOf("loadWeeklyNumbers("));
  });

  it("reads no names and shows none", () => {
    assert.doesNotMatch(loader, /first_name|last_name|phone/);
    assert.doesNotMatch(page, /first_name|last_name|email/);
  });

  it("says who is left out", () => {
    assert.match(page, /Team, test and suspended accounts are left out/);
  });
});
