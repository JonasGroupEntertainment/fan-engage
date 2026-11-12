import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runLapsedPass, type LapsedClient, type LapsedFilterBuilder, type LapsedTableBuilder } from "./lapsed-pass.ts";
import type { LapsedBatchResult, LapsedRecipient } from "./lapsed-send.ts";

type Row = Record<string, unknown>;

const NOW = new Date("2026-10-29T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();
const dateDaysAgo = (n: number) => daysAgo(n).slice(0, 10);

/**
 * A stub of the Supabase client that behaves like PostgREST on the one
 * point that matters here: `.range()` slices the table 1,000 rows at a
 * time, and nothing else caps it. Filters are applied for `.eq`/`.in` on
 * plain columns so the fans / artists / preferences queries select what
 * the real ones would; the rest of the filtering is the pass's own job.
 */
function stubClient(tables: Record<string, Row[]>) {
  const inserted: Record<string, Row[][]> = {};
  const ranges: Record<string, Array<[number, number]>> = {};
  const inSizes: Record<string, number[]> = {};

  function builder(table: string): LapsedTableBuilder {
    let rows = tables[table] ?? [];
    const b: LapsedFilterBuilder = {
      eq(column, value) {
        rows = rows.filter((r) => r[column] === value);
        return b;
      },
      not: () => b,
      gte: () => b,
      in(column, values) {
        (inSizes[table] ??= []).push(values.length);
        const set = new Set(values);
        rows = rows.filter((r) => set.has(r[column]));
        return b;
      },
      order: () => b,
      range(from, to) {
        (ranges[table] ??= []).push([from, to]);
        return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
      },
    };
    return {
      select: () => b,
      insert(newRows) {
        (inserted[table] ??= []).push(newRows);
        return Promise.resolve({ error: null });
      },
    };
  }
  const client: LapsedClient = { from: builder };
  return { client, inserted, ranges, inSizes };
}

function fanRows(n: number, over: (i: number) => Row = () => ({})): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `fan-${String(i).padStart(4, "0")}`,
    email: `fan${i}@example.com`,
    first_name: `Fan ${i}`,
    last_active_date: dateDaysAgo(20),
    created_at: daysAgo(90),
    is_internal: false,
    email_opted_in: true,
    suspended: false,
    ...over(i),
  }));
}

describe("runLapsedPass — more than 1,000 rows", () => {
  it("considers every fan, every ledger row and every membership past the 1,000-row cap", async () => {
    // 2,345 lapsed fans; the LAST 500 did something 2 days ago (ledger rows
    // that only appear on the third page) and must come out active.
    const fans = fanRows(2_345);
    const ledger = [
      ...Array.from({ length: 1_500 }, (_, i) => ({ fan_id: `fan-${String(i % 100).padStart(4, "0")}`, created_at: daysAgo(25) })),
      ...fans.slice(-500).map((f) => ({ fan_id: f.id, created_at: daysAgo(2) })),
    ];
    const memberships = fans.map((f) => ({ fan_id: f.id, community_id: "artist-one", status: "active" }));
    const { client, inserted, ranges, inSizes } = stubClient({
      fans,
      points_ledger: ledger,
      checkins: [],
      fan_community_memberships: memberships,
      notification_log: [],
      notification_preferences: [],
      artists: [{ slug: "artist-one", name: "Artist One" }],
    });

    const sent: LapsedRecipient[][] = [];
    const send = async (recipients: readonly LapsedRecipient[]): Promise<LapsedBatchResult> => {
      sent.push([...recipients]);
      return {
        provider: "mandrill",
        outcomes: recipients.map((r) => ({ fanId: r.fanId, ok: true })),
        campaignId: null,
        error: null,
      };
    };

    const result = await runLapsedPass({
      admin: client,
      testEmail: null,
      dryRun: false,
      now: NOW,
      send,
      baseHref: "https://example.com",
    });

    // Every page was read: fans 3 pages, ledger 3 pages, memberships 3 pages.
    assert.deepEqual(ranges.fans, [[0, 999], [1000, 1999], [2000, 2999]]);
    assert.deepEqual(ranges.points_ledger, [[0, 999], [1000, 1999], [2000, 2999]]);
    assert.deepEqual(ranges.fan_community_memberships, [[0, 999], [1000, 1999], [2000, 2999]]);

    assert.deepEqual(result.buckets, { active: 500, lapsed: 1_845, dormant: 0, unknown: 0 });
    assert.equal(result.candidates, 1_845);
    assert.equal(result.sent, 1_845);
    assert.equal(result.failed, 0);
    assert.equal(result.error, null);

    // Fans on the second page were nudged; fans 1,845–2,344 (active via
    // page-3 ledger rows, themselves on the third fans page) were not.
    const ids = new Set(sent[0].map((r) => r.fanId));
    assert.equal(ids.has("fan-1000"), true);
    assert.equal(ids.has("fan-1844"), true);
    assert.equal(ids.has("fan-1845"), false);
    assert.equal(ids.has("fan-2000"), false);
    assert.equal(ids.has("fan-2344"), false);
    assert.ok(sent[0][0].content.text.includes("Artist One kept posting"));

    // One notification_log row per send, with the dedup key.
    const log = inserted.notification_log?.[0] ?? [];
    assert.equal(log.length, 1_845);
    assert.equal(log[0].notification_type, "lapsed_nudge");
    assert.equal(log[0].status, "sent");
    assert.equal((log[0].metadata as Row).dedup_key, "lapsed_nudge:2026-10-29");
    assert.equal(inSizes.artists?.[0], 1);
  });

  it("dry run with >1,000 fans counts them all, sends nothing and records nothing", async () => {
    const fans = fanRows(1_200);
    const { client, inserted } = stubClient({
      fans,
      points_ledger: [],
      checkins: [],
      fan_community_memberships: [],
      notification_log: fans.slice(0, 1_100).map((f) => ({ fan_id: f.id, sent_at: daysAgo(3), notification_type: "lapsed_nudge", status: "sent" })),
      notification_preferences: [],
      artists: [],
    });
    let sends = 0;
    const result = await runLapsedPass({
      admin: client,
      testEmail: null,
      dryRun: true,
      now: NOW,
      send: async () => {
        sends += 1;
        return { provider: null, outcomes: [], campaignId: null, error: null };
      },
    });
    assert.equal(result.buckets.lapsed, 1_200);
    // 1,100 already nudged inside 30 days (read across two pages) → 100 left.
    assert.equal(result.candidates, 100);
    assert.equal(result.sample?.length, 10);
    assert.equal(result.sample?.[0].fanId, "fan-1100");
    assert.equal(sends, 0);
    assert.equal(inserted.notification_log, undefined);
  });

  it("testEmail narrows the send to one fan and reports the rest as skipped", async () => {
    const fans = fanRows(5);
    const { client } = stubClient({
      fans,
      points_ledger: [],
      checkins: [],
      fan_community_memberships: [],
      notification_log: [],
      notification_preferences: [],
      artists: [],
    });
    const result = await runLapsedPass({
      admin: client,
      testEmail: "FAN3@example.com",
      dryRun: true,
      now: NOW,
    });
    assert.equal(result.candidates, 1);
    assert.equal(result.skipped, 4);
    assert.equal(result.sample?.[0].fanId, "fan-0003");
  });
});
