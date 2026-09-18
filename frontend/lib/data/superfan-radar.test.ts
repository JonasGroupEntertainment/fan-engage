import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeSuperFans,
  TOP_FAN_LIMIT,
  type SuperFanRow,
} from "../superfan-radar/summarize.ts";

function readRepo(relFromHere: string): string {
  return readFileSync(fileURLToPath(new URL(relFromHere, import.meta.url)), "utf8");
}

function row(overrides: Partial<SuperFanRow> = {}): SuperFanRow {
  return {
    username: "fan",
    platform: "INSTAGRAM",
    super_fan_tier: "NONE",
    super_fan_index: 0,
    outreach_opt_in: false,
    ...overrides,
  };
}

test("summarizeSuperFans returns zeros and no top fans for an empty tenant", () => {
  const summary = summarizeSuperFans([]);

  assert.deepEqual(summary, {
    eliteCount: 0,
    coreCount: 0,
    candidateCount: 0,
    inviteReadyCount: 0,
    topFans: [],
  });
});

test("summarizeSuperFans counts each tier and invite-ready fans", () => {
  const rows = [
    row({ username: "a", super_fan_tier: "ELITE", outreach_opt_in: true }),
    row({ username: "b", super_fan_tier: "ELITE" }),
    row({ username: "c", super_fan_tier: "CORE", outreach_opt_in: true }),
    row({ username: "d", super_fan_tier: "CANDIDATE" }),
    row({ username: "e", super_fan_tier: "NONE", outreach_opt_in: true }),
  ];

  const summary = summarizeSuperFans(rows);

  assert.equal(summary.eliteCount, 2);
  assert.equal(summary.coreCount, 1);
  assert.equal(summary.candidateCount, 1);
  assert.equal(summary.inviteReadyCount, 3);
});

test("summarizeSuperFans sorts top fans by index descending and caps the list", () => {
  const rows = Array.from({ length: TOP_FAN_LIMIT + 5 }, (_, i) =>
    row({ username: `fan-${i}`, super_fan_index: i * 10, super_fan_tier: "CORE" }),
  );

  const { topFans } = summarizeSuperFans(rows);

  assert.equal(topFans.length, TOP_FAN_LIMIT);
  assert.equal(topFans[0]?.username, `fan-${TOP_FAN_LIMIT + 4}`);
  assert.equal(topFans[0]?.index, (TOP_FAN_LIMIT + 4) * 10);
  const indexes = topFans.map((f) => f.index);
  assert.deepEqual(indexes, [...indexes].sort((a, b) => b - a));
});

test("summarizeSuperFans normalizes unknown tiers and null fields", () => {
  const rows = [
    row({ username: "weird", super_fan_tier: "LEGEND", super_fan_index: null, outreach_opt_in: null }),
  ];

  const { topFans, eliteCount, inviteReadyCount } = summarizeSuperFans(rows);

  assert.equal(eliteCount, 0);
  assert.equal(inviteReadyCount, 0);
  assert.deepEqual(topFans[0], {
    username: "weird",
    platform: "INSTAGRAM",
    tier: "NONE",
    index: 0,
    outreachOptIn: false,
  });
});

test("summarizeSuperFans does not mutate the input rows", () => {
  const rows = [
    row({ username: "low", super_fan_index: 1 }),
    row({ username: "high", super_fan_index: 9 }),
  ];
  const snapshot = rows.map((r) => ({ ...r }));

  summarizeSuperFans(rows);

  assert.deepEqual(rows, snapshot);
});

test("getSuperFanRadarSummary looks up the tenant by community slug, not a numeric id", () => {
  const src = readRepo("./superfan-radar.ts");

  assert.match(src, /\.from\("tenants"\)/);
  assert.match(src, /\.eq\("type", "ARTIST"\)/);
  assert.match(src, /\.eq\("slug", communitySlug\)/);
  assert.doesNotMatch(src, /Number\(/);
});

test("admin nav links to the Super Fans page", () => {
  const src = readRepo("../../app/admin/layout.tsx");

  assert.match(src, /href: "\/admin\/super-fans", label: "Super Fans"/);
});

test("super fans page is gated on admin context", () => {
  const src = readRepo("../../app/admin/super-fans/page.tsx");

  assert.match(src, /getAdminContext\(\)/);
  assert.match(src, /redirect\("\/login\?next=\/admin\/super-fans"\)/);
  assert.match(src, /getSuperFanRadarSummary\(ctx\.currentCommunityId\)/);
});

test("Super Fan Radar client reads its keys from the environment only", () => {
  const src = readRepo("../superfan-radar/client.ts");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  assert.match(code, /process\.env\.FAD_SUPABASE_URL/);
  assert.match(code, /process\.env\.FAD_SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(code, /createClient\(url, serviceKey/);
  assert.doesNotMatch(code, /NEXT_PUBLIC_/);
  assert.doesNotMatch(code, /supabase\.co/);
});

test("artist portal payouts page reads artist_payouts through the RLS client", () => {
  const src = readRepo("../../app/artist-portal/payouts/page.tsx");

  assert.match(src, /const supabase = await createClient\(\)/);
  assert.match(src, /await supabase\s*\.from\("artist_payouts"\)/);
  assert.doesNotMatch(src, /await admin\s*\.from\("artist_payouts"\)/);
});

test("migration 0060 creates the artist_payouts owner read policy with a rollback", () => {
  const migration = readRepo("../../../supabase/migrations/0060_artist_payouts_owner_read.sql");
  const rollback = readRepo("../../../supabase/rollbacks/0060_artist_payouts_owner_read_rollback.sql");

  assert.match(migration, /drop policy if exists artist_payouts_admin_read/);
  assert.match(migration, /create policy artist_payouts_owner_read/);
  assert.match(migration, /au\.role = 'owner'/);
  assert.match(migration, /revoke all on table public\.artist_payouts from anon/);
  assert.match(rollback, /drop policy if exists artist_payouts_owner_read/);
  assert.doesNotMatch(rollback, /disable row level security/);
});
