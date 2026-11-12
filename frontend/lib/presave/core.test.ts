import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  PRESAVE_GRACE_DAYS,
  PRESAVE_HONEST_COPY,
  isPresaveLive,
  normalizePresavePoints,
  normalizePresaveUrl,
  presaveAwardRef,
  presaveReleaseLabel,
} from "./core.ts";

function readRepo(relFromLib: string): string {
  return readFileSync(fileURLToPath(new URL(relFromLib, import.meta.url)), "utf8");
}

const NOW = new Date("2026-10-29T15:00:00Z");

describe("presaveAwardRef", () => {
  it("is presave:<action>:<fan> — one ledger key per fan per campaign", () => {
    assert.equal(presaveAwardRef("act-1", "fan-9"), "presave:act-1:fan-9");
    // Same inputs → same key (apply_points_award dedups on source_ref).
    assert.equal(presaveAwardRef("act-1", "fan-9"), presaveAwardRef("act-1", "fan-9"));
    // Different fan or campaign → a different key.
    assert.notEqual(presaveAwardRef("act-1", "fan-9"), presaveAwardRef("act-1", "fan-10"));
    assert.notEqual(presaveAwardRef("act-1", "fan-9"), presaveAwardRef("act-2", "fan-9"));
  });

  it("the server action awards under that key with source 'presave' via awardPoints", () => {
    const action = readRepo("./actions.ts");
    assert.match(action, /awardPoints\(/);
    assert.match(action, /presaveAwardRef\(/);
    assert.match(action, /source: PRESAVE_POINT_SOURCE/);
    assert.match(action, /withPointsProgress\(/);
    // apply_points_award refuses a duplicate source_ref (0066).
    const rpc = readRepo("../../../supabase/migrations/0066_no_multiplier_on_refunds.sql");
    assert.match(rpc, /where source_ref = p_source_ref/);
  });
});

describe("isPresaveLive", () => {
  it("inactive rows are never live", () => {
    assert.equal(isPresaveLive({ active: false, release_date: "2026-12-01" }, NOW), false);
  });

  it("no release date = live while active", () => {
    assert.equal(isPresaveLive({ active: true, release_date: null }, NOW), true);
  });

  it("future release date is live", () => {
    assert.equal(isPresaveLive({ active: true, release_date: "2026-11-14" }, NOW), true);
  });

  it("release day and the grace window after it are live", () => {
    assert.equal(isPresaveLive({ active: true, release_date: "2026-10-29" }, NOW), true);
    const sixDaysAgo = "2026-10-23";
    assert.equal(isPresaveLive({ active: true, release_date: sixDaysAgo }, NOW), true);
  });

  it(`drops off ${PRESAVE_GRACE_DAYS} days after release`, () => {
    // Release 2026-10-22 00:00Z + 7d = 2026-10-29 00:00Z, which is before NOW.
    assert.equal(isPresaveLive({ active: true, release_date: "2026-10-22" }, NOW), false);
    assert.equal(isPresaveLive({ active: true, release_date: "2026-09-01" }, NOW), false);
  });

  it("ends_at in the past closes it regardless of release date", () => {
    assert.equal(
      isPresaveLive(
        { active: true, release_date: "2026-12-01", ends_at: "2026-10-01T00:00:00Z" },
        NOW,
      ),
      false,
    );
  });

  it("garbage release dates do not gate", () => {
    assert.equal(isPresaveLive({ active: true, release_date: "soon" }, NOW), true);
  });
});

describe("presaveReleaseLabel", () => {
  it("counts down then says Out now", () => {
    assert.equal(presaveReleaseLabel(null, NOW), null);
    assert.equal(presaveReleaseLabel("2026-10-30", NOW), "Out tomorrow");
    assert.equal(presaveReleaseLabel("2026-11-02", NOW), "Out in 4 days");
    assert.equal(presaveReleaseLabel("2026-12-04", NOW), "Out Dec 4");
    assert.equal(presaveReleaseLabel("2026-10-29", NOW), "Out now");
    assert.equal(presaveReleaseLabel("2026-10-01", NOW), "Out now");
  });
});

describe("admin input normalisation", () => {
  it("points default to 50 and clamp to 500", () => {
    assert.equal(normalizePresavePoints(""), 50);
    assert.equal(normalizePresavePoints("abc"), 50);
    assert.equal(normalizePresavePoints("-5"), 50);
    assert.equal(normalizePresavePoints("75"), 75);
    assert.equal(normalizePresavePoints(9999), 500);
  });

  it("only http(s) URLs are accepted", () => {
    assert.equal(normalizePresaveUrl("https://open.spotify.com/x"), "https://open.spotify.com/x");
    assert.equal(normalizePresaveUrl("javascript:alert(1)"), null);
    assert.equal(normalizePresaveUrl(""), null);
  });
});

describe("honest copy is on the fan card", () => {
  it("the card tells fans the save is not verified", () => {
    const card = readRepo("../../app/artists/[slug]/community/presave-card.tsx");
    assert.match(card, /PRESAVE_HONEST_COPY/);
    assert.match(PRESAVE_HONEST_COPY, /can't verify the save/);
  });

  it("0091 hands pre_save awards to the app and adds release_date", () => {
    const sql = readRepo("../../../supabase/migrations/0091_presave_and_ai_gates.sql");
    assert.match(sql, /add column if not exists release_date date/);
    assert.match(sql, /if v_kind = 'pre_save' then/);
    assert.match(sql, /fan_actions_anon_read_active/);
  });
});
